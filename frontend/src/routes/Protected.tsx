// frontend/src/routes/Protected.tsx
// =======================================================
// 🛡️ Protected (v1.2)
// - Proteção de rotas (React Router v6+)
// - Validação assíncrona com cache opcional
// - Suporte a roles e permissions
// - Redireciono com parâmetros e fallbacks customizáveis
// =======================================================

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authedFetch } from '../lib/authedFetch';

// ---------- Types ----------
export type AuthCheckResult = {
  ok: boolean;
  roles?: string[];
  user?: any;          // dados do usuário retornados pela API
  expiresAt?: number;  // timestamp de expiração opcional
};

export type ValidateFn = (token: string | null) => Promise<AuthCheckResult>;

export type ProtectedProps = {
  children: React.ReactNode;
  /** Exigir autenticação? (default: true) */
  requireAuth?: boolean;
  /** Caminho de redirecionamento quando não autorizado (default: "/login") */
  redirectTo?: string;
  /** Parâmetros adicionais para o redirecionamento */
  redirectParams?: Record<string, string>;
  /** Papéis obrigatórios para acessar a rota (ex: ['admin']) */
  requiredRoles?: string[];
  /** Permissões específicas (mais granular que roles) */
  requiredPermissions?: string[];
  /** Componente exibido enquanto valida (default: spinner simples) */
  fallback?: React.ReactNode;
  /** Componente para exibir quando não autorizado (opcional) */
  unauthorizedFallback?: React.ReactNode;
  /** Validação assíncrona opcional */
  validate?: ValidateFn;
  /** Função para obter o token */
  getToken?: () => string | null;
  /** Cache da validação em ms (default: 0 - sem cache) */
  validationCacheMs?: number;
  /** Callback quando a validação falha */
  onValidationFail?: (error: any) => void;
};

// ---------- Validation cache (módulo) ----------
const validationCache = new Map<string, { result: AuthCheckResult; timestamp: number }>();

// ---------- UI Fallbacks ----------
const DefaultFallback = () => (
  <div className="w-full h-full min-h-[200px] grid place-items-center p-8">
    <div className="flex flex-col items-center gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="text-sm text-gray-600">Verificando acesso...</span>
    </div>
  </div>
);

const DefaultUnauthorizedFallback = ({ redirectTo }: { redirectTo: string }) => (
  <div className="w-full h-full min-h-[200px] grid place-items-center p-8">
    <div className="text-center">
      <div className="text-lg font-medium text-gray-900 mb-2">Acesso não autorizado</div>
      <p className="text-gray-600">Você não tem permissão para acessar esta página.</p>
      {/* Nota: usamos <Navigate/> para redirecionar imediatamente */}
      <Navigate to={redirectTo} replace />
    </div>
  </div>
);

// ---------- Helpers ----------
function hasAllRoles(userRoles: string[] | undefined, required: string[] | undefined): boolean {
  if (!required || required.length === 0) return true;
  if (!userRoles || userRoles.length === 0) return false;

  const userRolesLower = userRoles.map((r) => r.toLowerCase());
  const requiredLower = required.map((r) => r.toLowerCase());

  return requiredLower.every((role) => userRolesLower.includes(role));
}

function hasAnyPermission(
  userPermissions: string[] | undefined,
  required: string[] | undefined
): boolean {
  if (!required || required.length === 0) return true;
  if (!userPermissions || userPermissions.length === 0) return false;

  const userPermsLower = userPermissions.map((p) => p.toLowerCase());
  const requiredLower = required.map((p) => p.toLowerCase());

  return requiredLower.some((permission) => userPermsLower.includes(permission));
}

function useValidationCache() {
  const clearExpired = () => {
    const now = Date.now();
    for (const [key, entry] of validationCache.entries()) {
      // expurgo defensivo genérico (5min) — o TTL efetivo é controlado por validationCacheMs
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

  const clear = (key?: string) => {
    if (key) validationCache.delete(key);
    else validationCache.clear();
  };

  return { get, set, clear };
}

// ---------- Protected Component ----------
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
    try { return localStorage.getItem('token'); } catch { return null; }
  },
  validationCacheMs = 0,
  onValidationFail,
}: ProtectedProps) {
  const location = useLocation();
  const token = useMemo(() => getToken(), [getToken]);
  const { get: getCache, set: setCache } = useValidationCache();

  const [checking, setChecking] = useState<boolean>(Boolean(validate));
  const [validationResult, setValidationResult] = useState<AuthCheckResult | null>(null);
  const [error, setError] = useState<any>(null);

  // URL de redirecionamento com parâmetros
  const buildRedirectUrl = useMemo(() => {
    const url = new URL(redirectTo, window.location.origin);
    const defaultParams = {
      from: location.pathname + location.search,
      ...redirectParams,
    };
    Object.entries(defaultParams).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    return url.pathname + url.search;
  }, [redirectTo, location, redirectParams]);

  // 1) Se exige auth e não há token -> redireciona já
  const hasToken = Boolean(token);
  if (requireAuth && !hasToken) {
    return <Navigate to={buildRedirectUrl} replace />;
  }

  // 2) Validação assíncrona opcional (com cache)
  useEffect(() => {
    let cancelled = false;

    const performValidation = async () => {
      if (!validate) {
        setChecking(false);
        return;
      }

      try {
        setChecking(true);
        setError(null);

        const cacheKey = `validate-${token}-${JSON.stringify(requiredRoles)}-${JSON.stringify(requiredPermissions)}`;
        const cached = validationCacheMs > 0 ? getCache(cacheKey) : null;

        if (cached && (Date.now() - cached.timestamp) < validationCacheMs) {
          if (!cancelled) {
            setValidationResult(cached.result);
            setChecking(false);
          }
          return;
        }

        const result = await validate(token);
        if (!cancelled) {
          setValidationResult(result);
          if (validationCacheMs > 0) setCache(cacheKey, result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
          onValidationFail?.(err);
          setValidationResult({ ok: false });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    performValidation();
    return () => { cancelled = true; };
  }, [validate, token, validationCacheMs, requiredRoles, requiredPermissions, onValidationFail, getCache, setCache]);

  // 3) Enquanto valida
  if (checking) {
    return <>{fallback ?? <DefaultFallback />}</>;
  }

  // 4) Determinar autorização
  const isAuthorized = useMemo(() => {
    if (!requireAuth) return true;

    // Se há validação, use o resultado
    if (validate && validationResult) {
      if (!validationResult.ok) return false;

      // roles
      if (!hasAllRoles(validationResult.roles, requiredRoles)) return false;

      // permissions
      if (requiredPermissions && requiredPermissions.length > 0) {
        const perms = validationResult.user?.permissions as string[] | undefined;
        if (!hasAnyPermission(perms, requiredPermissions)) return false;
      }

      return true;
    }

    // Se não há validação, exige token e (opcionalmente) roles do cache/estado
    return hasToken && hasAllRoles(validationResult?.roles, requiredRoles);
  }, [requireAuth, validate, validationResult, requiredRoles, requiredPermissions, hasToken]);

  // 5) Redireciona ou exibe fallback de não autorizado
  if (!isAuthorized) {
    if (unauthorizedFallback) return <>{unauthorizedFallback}</>;
    return <DefaultUnauthorizedFallback redirectTo={buildRedirectUrl} />;
  }

  // 6) Acesso liberado
  return <>{children}</>;
}

export default Protected;

// ---------- Helpers públicos ----------

/**
 * Cria um validador usando authedFetch.
 * Adapte o mapeamento conforme o shape da sua API.
 */
export function createAuthValidator(
  endpoint: string,
  options: {
    method?: string;
    onError?: (error: any) => void;
  } = {}
): ValidateFn {
  return async (token: string | null) => {
    try {
      if (!token) return { ok: false };

      const res = await authedFetch(endpoint, {
        method: options.method || 'GET',
        auth: true,
        parseJson: true,
        // Você pode incluir cacheMs aqui se o endpoint permitir (ex.: 10s)
        // cacheMs: 10_000,
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
      // Em caso de erro de rede, escolha a política que preferir. Aqui, invalidamos.
      return { ok: false };
    }
  };
}

/** Validador simples que apenas checa existência de token */
export const tokenOnlyValidator: ValidateFn = async (token: string | null) => ({
  ok: Boolean(token),
});

/**
 * Hook para limpar/invadidar o cache de validação
 */
export function useValidationCacheManager() {
  const invalidateAuthCache = useCallback((pattern?: string) => {
    if (pattern) {
      for (const key of Array.from(validationCache.keys())) {
        if (key.includes(pattern)) validationCache.delete(key);
      }
    } else {
      validationCache.clear();
    }
  }, []);

  return { invalidateAuthCache };
}

/**
 * Hook básico para reaproveitar a lógica fora do roteamento.
 * (Mantém a assinatura simples; personalize conforme seu caso.)
 */
export function useAuthGuard(options: {
  requireAuth?: boolean;
  requiredRoles?: string[];
  requiredPermissions?: string[];
  validate?: ValidateFn;
}) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const token = useMemo(() => {
    try { return localStorage.getItem('token'); } catch { return null; }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const okToken = options.requireAuth !== false ? Boolean(token) : true;
        if (!okToken) {
          if (!cancelled) setAuthorized(false);
          return;
        }
        if (options.validate) {
          const res = await options.validate(token);
          if (!cancelled) setAuthorized(
            res.ok &&
            hasAllRoles(res.roles, options.requiredRoles) &&
            (!options.requiredPermissions ||
              hasAnyPermission(res.user?.permissions, options.requiredPermissions))
          );
        } else {
          if (!cancelled) setAuthorized(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [token, options]);

  return { authorized, loading };
}
