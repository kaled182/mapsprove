// frontend/src/hooks/useAuthedMutation.ts
// =======================================================
// ✳️ useAuthedMutation (v1.2)
// - Tipagem avançada + helpers robustos
// - Idempotência, headers inteligentes, FormData seguro
// - Optimistic updates + invalidação direcionada
// =======================================================

import { useMemo } from 'react';
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { authedFetch, type AuthedFetchOptions, type AuthedFetchError } from '../lib/authedFetch';

// ---------- Tipos Melhorados ----------
type HTTPWriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined | (string | number | boolean)[]
>;

export type AuthedMutationFetchOptions = Pick<
  AuthedFetchOptions,
  | 'auth'
  | 'parseJson'
  | 'headers'
  | 'timeoutMs'
  | 'onUnauthorized'
  | 'maxRetries'
  | 'retryDelay'
> & {
  /** Header de idempotência */
  idempotencyKey?: string;
  /** Content-Type customizado (evitado para FormData) */
  contentType?: string;
};

export type InvalidateSpec = {
  path?: string;
  keyPrefix?: QueryKey;
  params?: QueryParams;
  exact?: boolean;
};

export type OptimisticUpdateConfig<TData = unknown, TVariables = unknown> = {
  queryKey: QueryKey;
  updateQuery: (oldData: TData | undefined, variables: TVariables) => TData;
  onErrorRollback?: boolean;
};

export type AuthedMutationOptions<
  TData = unknown,
  TError = AuthedFetchError,
  TVariables = unknown,
  TContext = unknown
> = Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'mutationFn'> & {
  /** Caminho relativo da API (suporta tokens :id) */
  path: string;
  /** Método HTTP */
  method?: HTTPWriteMethod;
  /** Parâmetros de query string */
  params?: QueryParams;
  /** Payload fixo (sobrescreve buildBody/variables) */
  json?: any;
  /** Constrói o body a partir das variables */
  buildBody?: (variables: TVariables) => any;
  /** Queries para invalidar no sucesso */
  invalidateQueries?: InvalidateSpec[];
  /** Configuração para optimistic update */
  optimisticUpdate?: OptimisticUpdateConfig<any, TVariables>;
  /** Callback de sucesso (mantida, mas envolvida internamente) */
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void | Promise<void>;
} & AuthedMutationFetchOptions;

export type OptimisticContext<TData = unknown> = {
  previousData: TData | undefined;
  queryKey: QueryKey;
  snapshotTime: number;
};

// ---------- Helpers Melhorados ----------
function withQueryString(path: string, params?: QueryParams): string {
  if (!params || Object.keys(params).length === 0) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Substitui tokens :param por valores de variables (ex.: /users/:id) */
function resolvePathParams(path: string, variables: any): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_m, k) => {
    const v = variables?.[k];
    return v === undefined || v === null ? '' : encodeURIComponent(String(v));
  });
}

/** Merge de headers com tratamento de Content-Type automático */
function buildHeaders(
  baseHeaders: HeadersInit | undefined,
  payload: any,
  options: {
    idempotencyKey?: string;
    contentType?: string;
  } = {}
): Headers {
  const headers = new Headers(baseHeaders);

  // Evita setar Content-Type manualmente para FormData (o browser define boundary)
  const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;

  if (!headers.has('Content-Type')) {
    if (options.contentType && !isFormData) {
      headers.set('Content-Type', options.contentType);
    } else if (
      typeof payload === 'object' &&
      payload !== null &&
      !isFormData &&
      !(payload instanceof Blob)
    ) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (options.idempotencyKey && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  return headers;
}

function buildRequestBody(payload: any): { body?: BodyInit; json?: any } {
  if (payload === undefined || payload === null) return {};
  if (
    (typeof FormData !== 'undefined' && payload instanceof FormData) ||
    payload instanceof Blob ||
    typeof payload === 'string'
  ) {
    return { body: payload as BodyInit };
  }
  if (typeof payload === 'object') {
    return { json: payload };
  }
  return { body: String(payload) as BodyInit };
}

function safeBase64(input: string): string {
  try {
    // Browser
    // @ts-ignore
    if (typeof btoa === 'function') return btoa(input);
  } catch { /* noop */ }
  try {
    // Node/SSR
    // @ts-ignore
    return Buffer.from(input, 'utf-8').toString('base64');
  } catch {
    return input;
  }
}

function generateIdempotencyKey(method: string, path: string, payload?: any): string {
  const timestamp = Date.now();
  const payloadHash = payload ? safeBase64(JSON.stringify(payload)).slice(0, 16) : 'empty';
  return `${method}-${path}-${payloadHash}-${timestamp}`;
}

// ---------- Invalidação Melhorada ----------
export function invalidateQueriesAfterSuccess(
  client: QueryClient,
  specs: InvalidateSpec[]
) {
  specs.forEach((spec) => {
    client.invalidateQueries({
      queryKey: spec.keyPrefix || ['authed'],
      predicate: (query) => {
        const key = query.queryKey;

        // keyPrefix
        if (spec.keyPrefix) {
          if (spec.exact) {
            if (key.length !== spec.keyPrefix.length) return false;
            if (!key.every((k, i) => k === spec.keyPrefix![i])) return false;
          } else {
            if (!key.slice(0, spec.keyPrefix.length).every((k, i) => k === spec.keyPrefix![i])) {
              return false;
            }
          }
        }

        // ['authed', { path, method, params }]
        const baseIndex = spec.keyPrefix?.length ?? 1; // 'authed' = 1
        const meta = key[baseIndex] as any;

        if (spec.path && meta?.path !== spec.path) return false;

        if (spec.params && meta?.params) {
          return Object.keys(spec.params).every((k) => meta.params[k] === spec.params![k]);
        }

        return true;
      },
    });
  });
}

export function invalidateAllByPrefix(client: QueryClient, keyPrefix: QueryKey) {
  return client.invalidateQueries({ queryKey: keyPrefix });
}

// ---------- Optimistic Updates ----------
export function createOptimisticUpdater<TData = any, TVariables = any>(
  client: QueryClient,
  config: OptimisticUpdateConfig<TData, TVariables>
) {
  return async (variables: TVariables): Promise<OptimisticContext<TData>> => {
    await client.cancelQueries({ queryKey: config.queryKey });
    const previousData = client.getQueryData<TData>(config.queryKey);
    client.setQueryData<TData>(config.queryKey, (old) => config.updateQuery(old, variables));
    return {
      previousData,
      queryKey: config.queryKey,
      snapshotTime: Date.now(),
    };
  };
}

export function rollbackOptimisticUpdate<TData = any>(
  client: QueryClient,
  context: OptimisticContext<TData>
) {
  client.setQueryData<TData>(context.queryKey, context.previousData);
}

function isOptimisticContext(context: any): context is OptimisticContext {
  return context && typeof context === 'object' && 'queryKey' in context && 'previousData' in context;
}

// ---------- Hook Principal Melhorado ----------
export function useAuthedMutation<
  TData = unknown,
  TError = AuthedFetchError,
  TVariables = unknown,
  TContext = unknown
>(
  options: AuthedMutationOptions<TData, TError, TVariables, TContext>
): UseMutationResult<TData, TError, TVariables, TContext> {
  const {
    path,
    method = 'POST',
    params,
    json,
    buildBody,
    // Fetch options
    auth = true,
    parseJson = true,
    headers,
    timeoutMs,
    maxRetries = 0,
    retryDelay = 1000,
    onUnauthorized,
    idempotencyKey,
    contentType,
    // Optimistic update
    optimisticUpdate,
    // Invalidation
    invalidateQueries,
    // React Query behaviors
    retry = (failureCount, error: any) => {
      // Não retenta em 4xx (exceto 408, 429)
      if (error?.status && error.status >= 400 && error.status < 500) {
        return error.status === 408 || error.status === 429;
      }
      return failureCount < (maxRetries || 0);
    },
    onSuccess,
    onError,
    onSettled,
    ...rqOptions
  } = options;

  const queryClient = useQueryClient();
  const urlBase = useMemo(() => withQueryString(path, params), [path, params]);

  const enhancedOnSuccess = useMemo(() => {
    if (!onSuccess && !invalidateQueries) return undefined;
    return async (data: TData, variables: TVariables, context: TContext) => {
      if (invalidateQueries && queryClient) {
        invalidateQueriesAfterSuccess(queryClient, invalidateQueries);
      }
      await onSuccess?.(data, variables, context);
    };
  }, [onSuccess, invalidateQueries, queryClient]);

  const enhancedOnError = useMemo(() => {
    if (!onError && !optimisticUpdate?.onErrorRollback) return undefined;
    return (error: TError, variables: TVariables, context: TContext) => {
      if (optimisticUpdate?.onErrorRollback && context && isOptimisticContext(context)) {
        rollbackOptimisticUpdate(queryClient, context as unknown as OptimisticContext);
      }
      onError?.(error, variables, context);
    };
  }, [onError, optimisticUpdate, queryClient]);

  const mutationFn = async (variables: TVariables): Promise<TData> => {
    // Path dinâmico (tokens :id etc.)
    const resolvedPath = resolvePathParams(urlBase, variables as any);

    // Determina o payload
    const payload =
      json !== undefined ? json : buildBody ? buildBody(variables) : (variables as any);

    // Headers
    const requestHeaders = buildHeaders(headers, payload, {
      idempotencyKey: idempotencyKey || generateIdempotencyKey(method, path, payload),
      contentType,
    });

    // Body
    const { body, json: jsonPayload } = buildRequestBody(payload);

    const res = await authedFetch(resolvedPath, {
      method,
      auth,
      parseJson,
      headers: requestHeaders,
      timeoutMs,
      maxRetries,
      retryDelay,
      onUnauthorized,
      json: jsonPayload,
      // @ts-expect-error AuthedFetchOptions aceita body em runtime
      body,
    } as AuthedFetchOptions);

    return res as TData;
  };

  return useMutation<TData, TError, TVariables, TContext>({
    mutationFn,
    retry,
    onSuccess: enhancedOnSuccess,
    onError: enhancedOnError,
    onSettled,
    ...rqOptions,
  });
}

// ---------- Hooks Especializados ----------

/** Mutation para criação com invalidação automática */
export function useCreateMutation<
  TData = { id: string },
  TError = AuthedFetchError,
  TVariables = unknown
>(
  resourcePath: string,
  options: Omit<AuthedMutationOptions<TData, TError, TVariables>, 'path' | 'method'> = {}
) {
  return useAuthedMutation<TData, TError, TVariables>({
    method: 'POST',
    path: resourcePath,
    invalidateQueries: [{ path: resourcePath }],
    ...options,
  });
}

/** Mutation para atualização (suporta path com :id) */
export function useUpdateMutation<
  TData = unknown,
  TError = AuthedFetchError,
  TVariables extends { id?: string; [k: string]: any } = { id: string }
>(
  resourcePath: string,
  options: Omit<AuthedMutationOptions<TData, TError, TVariables>, 'path' | 'method'> & {
    idKey?: string;
    optimistic?: boolean;
  } = {}
) {
  const { idKey = 'id', optimistic = true, ...mutationOptions } = options;

  const baseOptions: AuthedMutationOptions<TData, TError, TVariables> = {
    method: 'PUT',
    path: resourcePath.includes(':') ? resourcePath : `${resourcePath}/:${idKey}`,
    buildBody: (variables) => {
      const { [idKey]: _omit, ...body } = (variables as any) ?? {};
      return body;
    },
    ...mutationOptions,
  };

  if (optimistic && mutationOptions.optimisticUpdate) {
    return useOptimisticMutation<TData, TError, TVariables>({
      ...baseOptions,
      optimisticUpdate: mutationOptions.optimisticUpdate,
    });
  }

  return useAuthedMutation<TData, TError, TVariables>(baseOptions);
}

/** Mutation para deleção (suporta path com :id) */
export function useDeleteMutation<
  TData = unknown,
  TError = AuthedFetchError,
  TVariables extends { id?: string; [k: string]: any } = { id: string }
>(
  resourcePath: string,
  options: Omit<AuthedMutationOptions<TData, TError, TVariables>, 'path' | 'method' | 'buildBody'> = {}
) {
  return useAuthedMutation<TData, TError, TVariables>({
    method: 'DELETE',
    path: resourcePath.includes(':') ? resourcePath : `${resourcePath}/:id`,
    // DELETE geralmente não tem body; se precisar, passe buildBody no options.
    ...options,
  });
}

/** Mutation para upload de arquivos (usa FormData) */
export function useUploadMutation<
  TData = unknown,
  TError = AuthedFetchError
>(
  path: string,
  options: Omit<
    AuthedMutationOptions<TData, TError, FormData>,
    'path' | 'method' | 'contentType'
  > = {}
) {
  // Content-Type é intencionalmente omitido para FormData
  return useAuthedMutation<TData, TError, FormData>({
    method: 'POST',
    path,
    ...options,
  });
}

// ---------- Hook com optimistic update embutido ----------
export function useOptimisticMutation<
  TData = unknown,
  TError = AuthedFetchError,
  TVariables = unknown
>(
  options: AuthedMutationOptions<TData, TError, TVariables> & {
    optimisticUpdate: OptimisticUpdateConfig<any, TVariables>;
  }
) {
  const queryClient = useQueryClient();
  const { optimisticUpdate, ...mutationOptions } = options;

  return useAuthedMutation<TData, TError, TVariables, OptimisticContext>({
    ...mutationOptions,
    onMutate: createOptimisticUpdater(queryClient, optimisticUpdate),
    onError: (error, variables, context) => {
      if (context) rollbackOptimisticUpdate(queryClient, context);
      mutationOptions.onError?.(error, variables, context as any);
    },
    onSettled: (data, error, variables, context) => {
      if (context) queryClient.invalidateQueries({ queryKey: context.queryKey });
      mutationOptions.onSettled?.(data, error, variables, context as any);
    },
  });
}
