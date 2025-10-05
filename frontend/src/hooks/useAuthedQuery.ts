// frontend/src/hooks/useAuthedQuery.ts
// =======================================================
// 🔎 useAuthedQuery (v1.2)
// Wrapper para @tanstack/react-query + authedFetch
// - QueryKey estável com params normalizados (inclui arrays)
// - Cancelamento via AbortSignal
// - Presets para cache curto/longa duração, paginação e infinite query
// - Prefetch e invalidação utilitários
// =======================================================

import { useMemo } from 'react';
import {
  useQuery,
  useInfiniteQuery,
  type UseQueryOptions,
  type UseInfiniteQueryOptions,
  type UseQueryResult,
  type QueryKey,
  QueryClient,
  type QueryFunctionContext,
} from '@tanstack/react-query';

import { authedFetch, type AuthedFetchOptions } from '../lib/authedFetch';
export type { AuthedFetchError } from '../lib/authedFetch';

// ---------- Tipos ----------

type HTTPMethod = 'GET' | 'HEAD' | 'OPTIONS';

export type QueryParams = Record<
  string,
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>
>;

export type AuthedQueryFetchOptions = Pick<
  AuthedFetchOptions,
  'auth' | 'parseJson' | 'headers' | 'timeoutMs' | 'onUnauthorized' | 'maxRetries' | 'retryDelay'
>;

export type AuthedQueryOptions<TData = unknown, TError = unknown> = Omit<
  UseQueryOptions<TData, TError>,
  'queryKey' | 'queryFn'
> & {
  /** Caminho relativo da API. Ex.: '/api/topology/links' */
  path: string;
  /** Método HTTP seguro (default: 'GET') */
  method?: HTTPMethod;
  /** Query string params (arrays suportados como multi=1&multi=2) */
  params?: QueryParams;
  /** Prefixo custom no queryKey (para escopar caches) */
  keyPrefix?: QueryKey;
  /** Cache local (ms) usado para staleTime/gcTime quando definido */
  localCacheMs?: number;
} & AuthedQueryFetchOptions;

type AuthedQueryFunctionContext = QueryFunctionContext<QueryKey> & {
  signal?: AbortSignal; // compat extra
};

// ---------- Helpers ----------

/** Normaliza params para um queryKey determinístico */
function normalizeParams(obj: QueryParams | undefined): Record<string, string> | undefined {
  if (!obj) return undefined;

  const entries = Object.entries(obj)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        // ordena e junta com vírgula para estabilidade
        return [key, value.map(String).sort().join(',')];
      }
      return [key, String(value)];
    });

  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

/** Monta o QueryKey com versão opcional (cache busting) */
function makeKey(
  path: string,
  method: HTTPMethod,
  params?: QueryParams,
  keyPrefix?: QueryKey,
  version?: string | number
): QueryKey {
  const normalized = normalizeParams(params);
  const base = keyPrefix
    ? [keyPrefix, { path, method, params: normalized }]
    : ['authed', { path, method, params: normalized }];

  return version !== undefined ? [...base, version] : base;
}

/** Concatena path com querystring (trata arrays como múltiplos pares) */
function withQueryString(path: string, params?: QueryParams): string {
  if (!params || Object.keys(params).length === 0) return path;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach((vv) => qs.append(k, String(vv)));
    } else {
      qs.append(k, String(v));
    }
  }

  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

/** Extensão local para suportar AbortSignal ao chamar authedFetch */
type AuthedFetchWithSignal = AuthedFetchOptions & { signal?: AbortSignal };

/** Cria a queryFn com cancelamento */
function createQueryFunction<TData = unknown>(
  url: string,
  fetchOptions: AuthedQueryFetchOptions & { method: HTTPMethod }
) {
  return async (ctx: AuthedQueryFunctionContext): Promise<TData> => {
    const opts: AuthedFetchWithSignal = {
      ...fetchOptions,
      method: fetchOptions.method,
      signal: ctx.signal,
    };
    const res = await authedFetch(url, opts);
    return res as TData;
  };
}

// ---------- Hook principal ----------

export function useAuthedQuery<TData = unknown, TError = unknown>(
  options: AuthedQueryOptions<TData, TError>
): UseQueryResult<TData, TError> {
  const {
    path,
    method = 'GET',
    params,
    auth = true,
    parseJson = true,
    headers,
    timeoutMs,
    maxRetries = 0,
    retryDelay = 1000,
    onUnauthorized,
    keyPrefix,
    // React Query defaults
    enabled = true,
    localCacheMs,
    staleTime = 30_000, // 30s padrão
    gcTime = 5 * 60_000, // 5 min
    refetchOnWindowFocus = false,
    refetchOnMount = true,
    refetchOnReconnect = true,
    retry = (failureCount: number, error: any) => {
      // Sem retry em 4xx (exceto 408/429)
      if (error?.status >= 400 && error?.status < 500) {
        return error.status === 408 || error.status === 429;
      }
      return failureCount < 2;
    },
    ...rqOptions
  } = options;

  const queryKey = useMemo(
    () => makeKey(path, method, params, keyPrefix),
    [path, method, params, keyPrefix]
  );

  const url = useMemo(() => withQueryString(path, params), [path, params]);

  const fetchOpts = useMemo(
    () => ({
      auth,
      parseJson,
      headers,
      timeoutMs,
      maxRetries,
      retryDelay,
      onUnauthorized,
      method,
    }),
    [auth, parseJson, headers, timeoutMs, maxRetries, retryDelay, onUnauthorized, method]
  );

  const queryFn = useMemo(() => createQueryFunction<TData>(url, fetchOpts), [url, fetchOpts]);

  return useQuery<TData, TError>({
    queryKey,
    queryFn,
    enabled,
    staleTime: localCacheMs ?? staleTime,
    gcTime: localCacheMs ? localCacheMs * 2 : gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
    refetchOnReconnect,
    retry,
    ...rqOptions,
  });
}

// ---------- Presets úteis ----------

/** Cache longo (ex.: configurações estáticas) */
export function useAuthedQueryCached<TData = unknown, TError = unknown>(
  opts: AuthedQueryOptions<TData, TError> & { cacheHours?: number }
) {
  const { cacheHours = 24, ...query } = opts;
  const ms = cacheHours * 60 * 60 * 1000;

  return useAuthedQuery<TData, TError>({
    ...query,
    localCacheMs: ms,
    staleTime: ms,
    gcTime: ms * 2,
  });
}

/** Dados “frescos” (sem cache; refetch agressivo) */
export function useAuthedQueryFresh<TData = unknown, TError = unknown>(
  opts: AuthedQueryOptions<TData, TError>
) {
  return useAuthedQuery<TData, TError>({
    ...opts,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });
}

/** Paginada: adiciona page/limit/sort ao params e um keyPrefix consistente */
export function useAuthedQueryPaginated<TData = unknown, TError = unknown>(
  opts: AuthedQueryOptions<TData, TError> & {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }
) {
  const { page, pageSize, sortBy, sortOrder, ...rest } = opts;

  const mergedParams = useMemo(
    () => ({
      ...rest.params,
      page: Math.max(1, page),
      limit: Math.max(1, pageSize),
      ...(sortBy ? { sortBy, sortOrder: sortOrder || 'asc' } : {}),
    }),
    [page, pageSize, sortBy, sortOrder, rest.params]
  );

  return useAuthedQuery<TData, TError>({
    ...rest,
    params: mergedParams,
    keyPrefix: rest.keyPrefix ? [...rest.keyPrefix, 'paginated'] : ['authed', 'paginated'],
  });
}

// ---------- Prefetch / Invalidate / QueryFn util ----------

export async function prefetchAuthedQuery<TData = unknown, TError = unknown>(
  client: QueryClient,
  options: AuthedQueryOptions<TData, TError>
) {
  const { path, method = 'GET', params, keyPrefix } = options;
  const key = makeKey(path, method, params, keyPrefix);

  await client.prefetchQuery({
    queryKey: key,
    queryFn: (ctx: AuthedQueryFunctionContext) => {
      const url = withQueryString(path, params);
      const fo: AuthedQueryFetchOptions & { method: HTTPMethod } = {
        auth: options.auth ?? true,
        parseJson: options.parseJson ?? true,
        headers: options.headers,
        timeoutMs: options.timeoutMs,
        maxRetries: options.maxRetries ?? 0,
        retryDelay: options.retryDelay ?? 1000,
        onUnauthorized: options.onUnauthorized,
        method,
      };
      return createQueryFunction<TData>(url, fo)(ctx);
    },
    staleTime: options.staleTime ?? 30_000,
  });

  return key;
}

export function invalidateAuthedQueries(
  client: QueryClient,
  filters?: { path?: string; keyPrefix?: QueryKey; params?: QueryParams }
) {
  const { path, keyPrefix, params } = filters || {};

  return client.invalidateQueries({
    predicate: (query) => {
      const qk = query.queryKey;

      // prefixo
      if (keyPrefix && !qk.slice(0, keyPrefix.length).every((k, i) => k === keyPrefix[i])) {
        return false;
      }

      const base = keyPrefix || ['authed'];
      const meta = qk[base.length] as any;
      if (!meta || typeof meta !== 'object') return false;

      if (path && meta.path !== path) return false;

      if (params && meta.params) {
        // match parcial
        return Object.keys(params).every((k) => meta.params[k] === (normalizeParams(params) ?? {})[k]);
      }

      return true;
    },
  });
}

/** Devolve uma queryFn pronta para uso externo */
export function getAuthedQueryFn<TData = unknown>(opts: AuthedQueryOptions<TData>) {
  return (ctx: AuthedQueryFunctionContext): Promise<TData> => {
    const url = withQueryString(opts.path, opts.params);
    const fo: AuthedQueryFetchOptions & { method: HTTPMethod } = {
      auth: opts.auth ?? true,
      parseJson: opts.parseJson ?? true,
      headers: opts.headers,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries ?? 0,
      retryDelay: opts.retryDelay ?? 1000,
      onUnauthorized: opts.onUnauthorized,
      method: opts.method || 'GET',
    };
    return createQueryFunction<TData>(url, fo)(ctx);
  };
}

// ---------- Infinite Query ----------

export type InfiniteAuthedQueryOptions<TData = unknown, TError = unknown> = Omit<
  UseInfiniteQueryOptions<TData, TError>,
  'queryKey' | 'queryFn'
> & {
  path: string;
  method?: HTTPMethod;
  params?: QueryParams;
  keyPrefix?: QueryKey;
  getNextPageParam: (lastPage: TData, allPages: TData[]) => any | undefined;
} & AuthedQueryFetchOptions;

export function useAuthedInfiniteQuery<TData = unknown, TError = unknown>(
  options: InfiniteAuthedQueryOptions<TData, TError>
) {
  const {
    path,
    method = 'GET',
    params,
    keyPrefix,
    getNextPageParam,
    auth = true,
    parseJson = true,
    headers,
    timeoutMs,
    maxRetries = 0,
    retryDelay = 1000,
    onUnauthorized,
    ...rq
  } = options;

  const baseKey = useMemo(
    () => makeKey(path, method, params, keyPrefix),
    [path, method, params, keyPrefix]
  );

  const queryFn = async (ctx: AuthedQueryFunctionContext & { pageParam?: any }) => {
    const allParams = { ...params, ...ctx.pageParam };
    const url = withQueryString(path, allParams);

    const opts: AuthedFetchWithSignal = {
      auth,
      parseJson,
      headers,
      timeoutMs,
      maxRetries,
      retryDelay,
      onUnauthorized,
      method,
      signal: ctx.signal,
    };

    const res = await authedFetch(url, opts);
    return res as TData;
  };

  return useInfiniteQuery<TData, TError>({
    queryKey: baseKey,
    queryFn,
    getNextPageParam,
    ...rq,
  });
}
