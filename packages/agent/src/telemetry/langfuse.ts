import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

export { CallbackHandler, LangfuseSpanProcessor, NodeTracerProvider };

export type EnvRecord = Record<string, string | undefined>;

let registeredProvider: NodeTracerProvider | null = null;
let registeredSpanProcessor: LangfuseSpanProcessor | null = null;

/**
 * Verifica se as chaves do Langfuse (`LANGFUSE_PUBLIC_KEY` e `LANGFUSE_SECRET_KEY`)
 * estão configuradas e não são vazias.
 */
export function isLangfuseConfigured(env: EnvRecord = process.env): boolean {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  return Boolean(publicKey && secretKey);
}

/**
 * Registra um `NodeTracerProvider` do OpenTelemetry com `LangfuseSpanProcessor`
 * uma única vez no boot do processo.
 *
 * Se `LANGFUSE_PUBLIC_KEY` ou `LANGFUSE_SECRET_KEY` não estiverem configuradas,
 * não registra nada e retorna `null` sem impedir o processo de subir.
 */
export function registerLangfuseTelemetry(env: EnvRecord = process.env): NodeTracerProvider | null {
  if (!isLangfuseConfigured(env)) {
    return null;
  }

  if (registeredProvider) {
    return registeredProvider;
  }

  const publicKey = env.LANGFUSE_PUBLIC_KEY!.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY!.trim();
  const baseUrl = (env.LANGFUSE_BASE_URL ?? env.LANGFUSE_HOST)?.trim();

  const spanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    ...(baseUrl ? { baseUrl } : {}),
  });

  const provider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });

  provider.register();
  registeredProvider = provider;
  registeredSpanProcessor = spanProcessor;

  return provider;
}

export const initLangfuseTelemetry = registerLangfuseTelemetry;
export const initLangfuse = registerLangfuseTelemetry;
export const initTelemetry = registerLangfuseTelemetry;
export const registrarTelemetriaLangfuse = registerLangfuseTelemetry;

/**
 * Cria uma nova instância de `CallbackHandler` (`@langfuse/langchain`)
 * para instrumentar uma chamada de `graph.stream()` ou `graph.invoke()`.
 *
 * Retorna `null` quando as chaves do Langfuse não estão configuradas.
 */
export function createLangfuseCallbackHandler(
  env: EnvRecord = process.env,
): CallbackHandler | null {
  if (!isLangfuseConfigured(env)) {
    return null;
  }

  return new CallbackHandler();
}

export const criarCallbackHandlerLangfuse = createLangfuseCallbackHandler;

/**
 * Retorna um array contendo um novo `CallbackHandler` do Langfuse quando as chaves
 * estão configuradas, ou um array vazio `[]` quando não estão configuradas.
 * Permite compor diretamente no call site:
 * `callbacks: [...criarLangfuseCallbacks(), criarMetricsCallback()]`
 */
export function criarLangfuseCallbacks(env: EnvRecord = process.env): CallbackHandler[] {
  const handler = createLangfuseCallbackHandler(env);
  return handler ? [handler] : [];
}

export const createLangfuseCallbacks = criarLangfuseCallbacks;

function hasLangfuseCallback(callbacks: unknown[]): boolean {
  return callbacks.some(
    (cb) =>
      cb instanceof CallbackHandler ||
      (typeof cb === 'object' &&
        cb !== null &&
        'name' in cb &&
        (cb as { name?: unknown }).name === 'LangfuseCallbackHandler'),
  );
}

/**
 * Anexa um novo `CallbackHandler` do Langfuse ao objeto de opções (`callbacks`)
 * de `graph.stream()` ou `graph.invoke()`.
 *
 * Quando as chaves do Langfuse não estão configuradas, devolve `options` inalterado.
 */
export function withLangfuseCallbacks<T extends Record<string, unknown> | undefined>(
  options?: T,
  env: EnvRecord = process.env,
): T | (Record<string, unknown> & { callbacks: unknown[] }) {
  if (!isLangfuseConfigured(env)) {
    return options as T;
  }

  const existingCallbacks = Array.isArray(options?.callbacks) ? options.callbacks : [];
  if (hasLangfuseCallback(existingCallbacks)) {
    return options as T;
  }

  const handler = createLangfuseCallbackHandler(env);
  if (!handler) {
    return options as T;
  }

  return {
    ...(options ?? {}),
    callbacks: [...existingCallbacks, handler],
  };
}

/**
 * Retorna o `NodeTracerProvider` registrado no processo atual (ou `null`).
 */
export function getRegisteredTracerProvider(): NodeTracerProvider | null {
  return registeredProvider;
}

/**
 * Retorna o `LangfuseSpanProcessor` registrado no processo atual (ou `null`).
 */
export function getRegisteredSpanProcessor(): LangfuseSpanProcessor | null {
  return registeredSpanProcessor;
}

/**
 * Reseta o estado do provider registrado (uso exclusivo em testes unitários).
 */
export async function resetLangfuseTelemetry(): Promise<void> {
  if (registeredSpanProcessor) {
    try {
      await registeredSpanProcessor.shutdown();
    } catch {
      // Ignora erros de shutdown em ambiente de teste sem rede
    }
  }
  registeredProvider = null;
  registeredSpanProcessor = null;
}
