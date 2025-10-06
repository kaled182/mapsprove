// backend/src/routes/healthRoutes.js
// Health endpoints em ESM com checks paralelos, opcionais e observabilidade rica.
// Endpoints:
//  - GET /livez    → liveness mínimo (sem dependências externas)
//  - GET /readyz   → readiness com checks paralelos e timeout por check
//  - GET /healthz  → visão completa (checks + métricas do host + versão)
//  - GET /version  → metadados de versão/build
//
// Integração:
//   import healthRouter, { createHealthRouter, healthCheckLogger } from './routes/healthRoutes.js';
//   app.use('/health', healthCheckLogger, createHealthRouter({ ...opts }));
//
// Opções (factory):
//   {
//     db?: { ping: () => Promise<boolean> },
//     requiredEnv?: string[],
//     dbTimeoutMs?: number,
//     customChecks?: HealthCheck[],
//     enableSystemChecks?: boolean
//   }

import express from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* ------------------------------------------------------------------ */
/* Helpers base (ESM-friendly)                                        */
/* ------------------------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Import dinâmico opcional (retorna o namespace do módulo ou null).
 * @param {string} name
 * @returns {Promise<any|null>}
 */
export const optionalImport = async (name) => {
  try {
    return await import(name);
  } catch {
    return null;
  }
};

/**
 * Aplica timeout a uma promise.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label='operation']
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms, label = 'operation') =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

const readJSONSafe = (p) => {
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const guessPkgJson = () => {
  const p1 = path.resolve(__dirname, '..', 'package.json');
  if (fs.existsSync(p1)) return readJSONSafe(p1);
  const p2 = path.resolve(__dirname, '..', '..', 'package.json');
  if (fs.existsSync(p2)) return readJSONSafe(p2);
  return null;
};

const getVersionInfo = () => {
  const pkg = guessPkgJson() || {};
  return {
    name: process.env.APP_NAME || pkg.name || 'mapsprove-backend',
    version: process.env.APP_VERSION || pkg.version || '0.0.0',
    commit: process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || null,
    buildTime: process.env.BUILD_TIME || null,
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
  };
};

/* ------------------------------------------------------------------ */
/* Tipos (JSDoc)                                                      */
/* ------------------------------------------------------------------ */
/**
 * @typedef {Object} HealthCheck
 * @property {string} name
 * @property {() => Promise<boolean>} check
 * @property {number} timeoutMs
 * @property {boolean} [optional=false]
 */

/**
 * @typedef {Object} CheckResult
 * @property {string} name
 * @property {boolean} ok
 * @property {'healthy'|'degraded'|'unhealthy'|'error'|'unknown'} status
 * @property {number} durationMs
 * @property {string} [error]
 */

/* ------------------------------------------------------------------ */
/* Factory de checks padronizados                                     */
/* ------------------------------------------------------------------ */

/**
 * Gera a lista de health checks com base nas opções.
 * @param {object} [opts]
 * @param {{ ping: () => Promise<boolean> }} [opts.db]
 * @param {string[]} [opts.requiredEnv]
 * @param {number} [opts.dbTimeoutMs]
 * @param {HealthCheck[]} [opts.customChecks]
 * @param {boolean} [opts.enableSystemChecks]
 * @returns {HealthCheck[]}
 */
function createHealthChecks(opts = {}) {
  const {
    db,
    requiredEnv = ['DATABASE_URL', 'APP_SECRET'],
    dbTimeoutMs = 2500,
    customChecks = [],
    enableSystemChecks = true,
  } = opts;

  /** @type {HealthCheck[]} */
  const checks = [];

  // Environment
  checks.push({
    name: 'environment',
    timeoutMs: 1000,
    check: async () => {
      const missing = requiredEnv.filter((k) => !(`${process.env[k] || ''}`).trim());
      if (missing.length > 0) {
        throw new Error(`Missing env vars: ${missing.join(', ')}`);
      }
      return true;
    },
  });

  // Database (via injeção preferencialmente; fallback tenta 'pg' se houver DATABASE_URL)
  if (db?.ping) {
    checks.push({
      name: 'database',
      timeoutMs: dbTimeoutMs,
      check: async () => {
        const ok = await db.ping();
        if (!ok) throw new Error('db.ping returned false');
        return true;
      },
    });
  } else if (process.env.DATABASE_URL) {
    checks.push({
      name: 'database',
      timeoutMs: dbTimeoutMs,
      check: async () => {
        const pgNs = await optionalImport('pg');
        if (!pgNs?.Client) throw new Error('pg.Client not available');
        const client = new pgNs.Client({
          connectionString: process.env.DATABASE_URL,
          statement_timeout: dbTimeoutMs,
          connectionTimeoutMillis: dbTimeoutMs,
        });
        try {
          await client.connect();
          const r = await client.query('SELECT 1 AS health_check');
          return r.rows?.[0]?.health_check === 1;
        } finally {
          await client.end().catch(() => {});
        }
      },
    });
  }

  // System (CPU/Mem/Load) — pode ser desabilitado via enableSystemChecks: false
  if (enableSystemChecks) {
    checks.push({
      name: 'system',
      timeoutMs: 2000,
      check: async () => {
        const free = os.freemem();
        const total = os.totalmem();
        const freePct = (free / total) * 100;

        // Alerta se livre < 5%
        if (freePct < 5) {
          throw new Error(`Low memory: ${freePct.toFixed(1)}% free`);
        }

        // Load médio (1 min) por core — alerta se > 2.0
        const [load1] = os.loadavg();
        const cores = Math.max(1, os.cpus()?.length || 1);
        const perCore = load1 / cores;
        if (perCore > 2.0) {
          throw new Error(`High system load: ${perCore.toFixed(2)} per core`);
        }

        return true;
      },
    });
  }

  // Custom
  checks.push(...customChecks);

  return checks;
}

/* ------------------------------------------------------------------ */
/* Executor paralelo de checks                                        */
/* ------------------------------------------------------------------ */

/**
 * Executa todos os checks em paralelo aplicando timeout por check.
 * @param {HealthCheck[]} checks
 * @returns {Promise<{ok: boolean, results: CheckResult[], totalDuration: number, timestamp: string}>}
 */
async function runHealthChecks(checks) {
  const startedAt = Date.now();

  const promises = checks.map(async (c) => {
    const t0 = Date.now();
    /** @type {CheckResult} */
    const result = { name: c.name, ok: false, status: 'unknown', durationMs: 0 };

    try {
      await withTimeout(c.check(), c.timeoutMs, c.name);
      result.ok = true;
      result.status = 'healthy';
    } catch (err) {
      // Se for opcional, marca como "degraded" e mantém ok=true.
      if (c.optional) {
        result.ok = true;
        result.status = 'degraded';
        result.error = err?.message || String(err);
      } else {
        result.ok = false;
        result.status = 'unhealthy';
        result.error = err?.message || String(err);
      }
    } finally {
      result.durationMs = Date.now() - t0;
    }
    return result;
  });

  const settled = await Promise.allSettled(promises);

  /** @type {CheckResult[]} */
  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      name: checks[i]?.name || 'unknown',
      ok: !!checks[i]?.optional,
      status: 'error',
      durationMs: 0,
      error: s.reason?.message || 'Check execution failed',
    };
  });

  const ok = results.every((r) => r.ok === true);
  const totalDuration = Date.now() - startedAt;

  return { ok, results, totalDuration, timestamp: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Middleware opcional de logging                                     */
/* ------------------------------------------------------------------ */

/**
 * Middleware simples para log estruturado dos endpoints de health.
 */
export function healthCheckLogger(req, res, next) {
  const t0 = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - t0;
    const level = res.statusCode >= 500 ? 'error' : 'info';
    // eslint-disable-next-line no-console
    console[level]({
      type: 'health_check',
      endpoint: req.originalUrl || req.url,
      method: req.method,
      statusCode: res.statusCode,
      durationMs: duration,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    });
  });
  next();
}

/* ------------------------------------------------------------------ */
/* Router factory                                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {object} [opts]
 * @param {{ ping: () => Promise<boolean> }} [opts.db]
 * @param {string[]} [opts.requiredEnv]
 * @param {number} [opts.dbTimeoutMs]
 * @param {HealthCheck[]} [opts.customChecks]
 * @param {boolean} [opts.enableSystemChecks]
 * @returns {import('express').Router}
 */
export function createHealthRouter(opts = {}) {
  const router = express.Router();

  const versionInfo = getVersionInfo();
  const checks = createHealthChecks(opts);

  // /livez — mínimo para k8s/docker
  router.get('/livez', (_req, res) => {
    res.status(200).json({
      ok: true,
      status: 'alive',
      pid: process.pid,
      uptime_s: Math.round(process.uptime()),
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
    });
  });

  // /readyz — considera checks
  router.get('/readyz', async (_req, res) => {
    try {
      const health = await runHealthChecks(checks);
      res.status(health.ok ? 200 : 503).json({
        ok: health.ok,
        status: health.ok ? 'ready' : 'not_ready',
        checks: health.results,
        duration_ms: health.totalDuration,
        pid: process.pid,
        uptime_s: Math.round(process.uptime()),
        hostname: os.hostname(),
        timestamp: health.timestamp,
      });
    } catch (err) {
      res.status(503).json({
        ok: false,
        status: 'error',
        error: err?.message || String(err),
        pid: process.pid,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // /healthz — visão completa (útil para debugging/observabilidade)
  router.get('/healthz', async (_req, res) => {
    const health = await runHealthChecks(checks);
    const free = os.freemem();
    const total = os.totalmem();
    res.status(health.ok ? 200 : 503).json({
      ...health,
      version: versionInfo,
      system: {
        pid: process.pid,
        uptime_s: Math.round(process.uptime()),
        hostname: os.hostname(),
        memory: {
          free,
          total,
          usage_pct: +(((total - free) / total) * 100).toFixed(1),
        },
        loadavg: os.loadavg(),
        cpus: os.cpus()?.length || 1,
      },
    });
  });

  // /version — metadados de build/release
  router.get('/version', (_req, res) => {
    res.status(200).json({
      ok: true,
      ...versionInfo,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

// Export default + named para flexibilidade de import
const healthRouter = createHealthRouter();
export default healthRouter;
