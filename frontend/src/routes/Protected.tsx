// frontend/src/routes/Protected.tsx
// =======================================================
// 🛡️ Protected Route (v1.3)
// - Tipagem robusta (roles, permissions, user, expiresAt)
// - Validação opcional assíncrona com cache
// - Redireciono elegante com preservação de origem
// - Fallbacks personalizáveis e helpers exportados
// =======================================================

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authedFetch } from '../lib/authedFetch';

// ---------- Tipos ----------
export type AuthCheckResult = {
  ok: boolean;
  roles?: string[];
  user?: any;
  expiresAt?: number;
};

export type ValidateFn = (token: string | null) => Promise<AuthCheckResult>;

export type ProtectedProps = {
  children: React.ReactNode;
  requireAuth?: boolean;               // default: true
  redirectTo?: string;                 // default: "/login"
  redirectParams?: Record<string, string>;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  fallback?: React.ReactNode;
  unauthorizedFallback?: React.ReactNode;
  validate?: ValidateFn;
  getToken?: () => string | null;      // default: localStorage.getItem('token')
  validationCacheMs?: number;          // default: 0 (sem cache)
  onValidationFail?: (error: any) => void;
};

// ---------- Cache de validação (memória) ----------
const validationCache = new Map<string, { result: AuthCheckResult; timestamp: number }>();

function useValidationCache() {
  const clearExpired = () => {
    const now = Date.now();
    for (const [key, entry] of validationCache.entries()) {
      // expurgo defensivo a cada acesso (5 min padrão)
      if (now - entry.timestamp > 5 * 60 * 1000) {
        validationCache.delete(key);
      }
    }
  };

  const get = (key: string) => {
    clearExpired();
    return validationCache.get(key);
  };

  const set = (key: string, result: AuthCheckResult) => {
    validationCache.set(key, { result, timestamp: Date.now() });
  };

  const clear = (pattern?: string) => {
    if (!pattern) {
      validationCache.clear();
      return;
    }
    for (const k of [...validationCache.keys()]) {
      if (k.includes(pattern)) validationCache.delete(k);
    }
  };

  return { get, set, clear };
}

// ---------- Fallbacks ----------
const DefaultFallback = () => (
  <div className="w-full h-full min-h-[200px] grid place-items-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      <span className="text-sm text-gray-600">Verificando acesso...</span>
    </div>
  </div>
);

// ---------- Helpers de autorização ----------
function hasAllRoles(userRoles: string[] | undefined, required: string[] | undefined): boolean {
  if (!required || required.length === 0) return true;
  if (!userRoles || userRoles.length === 0) return false;
  const u = userRoles.map((r) => r.toLowerCase());
  const req = required.map((r) => r.toLowerCase());
  return req.every((r) => u.includes(r));
}

function hasAnyPermission(
  userPermissions: string[] | undefined,
  required: string[] | undefined
): boolean {
  if (!required || required.length === 0) return true;
  if (!userPermissions || userPermissions.length === 0) return false;
  const u = userPermissions.map((p) => p.toLowerCase());
  const req = required.map((p) => p.toLowerCase());
  return req.some((p) => u.includes(p));
}

// ---------- Componente principal ----------
export function Protected({
  children,
  requireAuth = true,
  redirectTo = '/login',
  redirectParams = {},
  requiredRoles,
  requiredPermissions,
  fallback,
  unauthorizedFallback,
  validate,
  getToken = () => {
    try {
      return localStorage.getItem('token');
    } catch {
      return null;
    }
  },
  validationCacheMs = 0,
  onValidationFail,
}: ProtectedProps) {
  const location = useLocation();
  const token = useMemo(() => getToken(), [getToken]);
  const { get: getCache, set: setCache } = useValidationCache();

  // construir URL de redirecionamento com origem preservada
  const redirectUrl = useMemo(() => {
    const url = new URL(redirectTo, window.location.origin);
    const defaultParams = { from: location.pathname + location.search, ...redirectParams };
    Object.entries(defaultParams).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.pathname + url.search;
  }, [redirectTo, location, redirectParams]);

  // regra 1: se precisa de auth e não há token → vai pro login
  const hasToken = Boolean(token);
  if (requireAuth && !hasToken) {
    return <Navigate to={redirectUrl} replace />;
  }

  // estado de validação/remoto
  const [checking, setChecking] = useState<boolean>(Boolean(validate));
  const [validationResult, setValidationResult] = useState<AuthCheckResult | null>(null);

  // regra 2: se há validate, executar (com cache opcional)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!validate) {
        setChecking(false);
        return;
      }
      try {
        setChecking(true);

        const cacheKey =
          validationCacheMs > 0
            ? `validate:${JSON.stringify({
                token: token ? 'present' : 'absent',
                roles: requiredRoles ?? [],
                perms: requiredPermissions ?? [],
              })}`
            : '';

        if (cacheKey) {
          const cached = getCache(cacheKey);
          if (cached && Date.now() - cached.timestamp < validationCacheMs) {
            if (!cancelled) {
              setValidationResult(cached.result);
              setChecking(false);
            }
            return;
          }
        }

        const result = await validate(token);

        if (!cancelled) {
          setValidationResult(result);
          if (validationCacheMs > 0 && cacheKey) {
            setCache(cacheKey, result);
          }
        }
      } catch (err) {
        if (!cancelled) {
          onValidationFail?.(err);
          setValidationResult({ ok: false });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [validate, token, validationCacheMs, requiredRoles, requiredPermissions, getCache, setCache, onValidationFail]);

  // enquanto valida
  if (checking) {
    return <>{fallback ?? <DefaultFallback />}</>;
  }

  // regra 3: decisão final de autorização
  const isAuthorized = useMemo(() => {
    if (!requireAuth) return true; // rota pública
    if (!validate) {
      // sem validação remota: apenas checa token e roles passadas
      return hasToken && hasAllRoles(undefined, requiredRoles);
    }
    if (!validationResult?.ok) return false;

    if (!hasAllRoles(validationResult.roles, requiredRoles)) return false;

    if (requiredPermissions && requiredPermissions.length > 0) {
      // tenta extrair permissões do usuário retornado
      const perms = Array.isArray(validationResult.user?.permissions)
        ? (validationResult.user.permissions as string[])
        : undefined;
      if (!hasAnyPermission(perms, requiredPermissions)) return false;
    }

    // opcional: considerar expiresAt
    if (validationResult.expiresAt && Date.now() > validationResult.expiresAt) return false;

    return true;
  }, [requireAuth, validate, validationResult, requiredRoles, requiredPermissions, hasToken]);

  if (!isAuthorized) {
    return unauthorizedFallback ? <>{unauthorizedFallback}</> : <Navigate to={redirectUrl} replace />;
  }

  return <>{children}</>;
}

// ---------- Helpers exportados ----------

/** Cria um validador baseado em authedFetch num endpoint (ex.: /api/auth/me) */
export function createAuthValidator(
  endpoint: string,
  options: { method?: 'GET' | 'POST'; onError?: (error: any) => void } = {}
): ValidateFn {
  return async (token: string | null) => {
    try {
      if (!token) return { ok: false };

      const res = await authedFetch(endpoint, {
        method: options.method ?? 'GET',
        auth: true,
        parseJson: true,
      });

      return {
        ok: true,
        roles: res.roles || res.user?.roles,
        user: res.user || res,
        expiresAt: res.expiresAt || res.user?.expiresAt,
      };
    } catch (error: any) {
      options.onError?.(error);
      if (error?.status === 401 || error?.status === 403) return { ok: false };
      // erro de rede/servidor — comportamento conservador: negar acesso
      return { ok: false };
    }
  };
}

/** Validador mínimo: apenas exige presença de token */
export const tokenOnlyValidator: ValidateFn = async (token) => ({ ok: Boolean(token) });

/** Hook utilitário para invalidar o cache de validação quando necessário */
export function useValidationCacheManager() {
  const { clear } = useValidationCache();
  const invalidateAuthCache = useCallback((pattern?: string) => clear(pattern), [clear]);
  return { invalidateAuthCache };
}

/** Hook leve para proteger blocos dentro de um componente (opcional) */
export function useAuthGuard(opts: {
  requireAuth?: boolean;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  validate?: ValidateFn;
}) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const token = useMemo(() => {
    try {
      return localStorage.getItem('token');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const needAuth = opts.requireAuth ?? true;
      if (!needAuth) {
        if (!cancelled) {
          setAuthorized(true);
          setLoading(false);
        }
        return;
      }

      if (!token) {
        if (!cancelled) {
          setAuthorized(false);
          setLoading(false);
        }
        return;
      }

      if (!opts.validate) {
        // sem validação remota: apenas token presente
        if (!cancelled) {
          setAuthorized(true);
          setLoading(false);
        }
        return;
      }

      try {
        const result = await opts.validate(token);
        if (!cancelled) {
          let ok = result.ok;
          if (ok && opts.requiredRoles?.length) {
            ok = hasAllRoles(result.roles, opts.requiredRoles);
          }
          if (ok && opts.requiredPermissions?.length) {
            const perms = Array.isArray(result.user?.permissions)
              ? (result.user.permissions as string[])
              : undefined;
            ok = hasAnyPermission(perms, opts.requiredPermissions);
          }
          setAuthorized(ok);
        }
      } catch {
        if (!cancelled) setAuthorized(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [opts.requireAuth, opts.requiredRoles, opts.requiredPermissions, opts.validate, token]);

  return { authorized, loading };
}
