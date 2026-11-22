import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentGraph } from '../graph.js';
import {
  CallbackHandler,
  createLangfuseCallbackHandler,
  getRegisteredSpanProcessor,
  getRegisteredTracerProvider,
  isLangfuseConfigured,
  LangfuseSpanProcessor,
  NodeTracerProvider,
  registerLangfuseTelemetry,
  resetLangfuseTelemetry,
  withLangfuseCallbacks,
} from './langfuse.js';

describe('Instrumentação Langfuse (@langfuse/otel + @langfuse/langchain)', () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetLangfuseTelemetry();
    vi.restoreAllMocks();
  });

  it('não registra NodeTracerProvider nem cria CallbackHandler quando as chaves não estão configuradas', () => {
    const emptyEnv = {};

    expect(isLangfuseConfigured(emptyEnv)).toBe(false);
    expect(isLangfuseConfigured({ LANGFUSE_PUBLIC_KEY: 'pk-lf-only' })).toBe(false);
    expect(isLangfuseConfigured({ LANGFUSE_SECRET_KEY: 'sk-lf-only' })).toBe(false);

    const registerSpy = vi.spyOn(NodeTracerProvider.prototype, 'register');

    const provider = registerLangfuseTelemetry(emptyEnv);
    expect(provider).toBeNull();
    expect(getRegisteredTracerProvider()).toBeNull();
    expect(getRegisteredSpanProcessor()).toBeNull();
    expect(registerSpy).not.toHaveBeenCalled();

    const handler = createLangfuseCallbackHandler(emptyEnv);
    expect(handler).toBeNull();

    const originalOptions = { streamMode: 'updates' as const };
    expect(withLangfuseCallbacks(originalOptions, emptyEnv)).toBe(originalOptions);
    expect(withLangfuseCallbacks(undefined, emptyEnv)).toBeUndefined();
  });

  it('registra NodeTracerProvider com LangfuseSpanProcessor uma única vez no boot quando as chaves estão configuradas', () => {
    const env = {
      LANGFUSE_PUBLIC_KEY: 'pk-lf-test-123',
      LANGFUSE_SECRET_KEY: 'sk-lf-test-456',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
    };

    const registerSpy = vi.spyOn(NodeTracerProvider.prototype, 'register');

    const firstProvider = registerLangfuseTelemetry(env);
    expect(firstProvider).toBeInstanceOf(NodeTracerProvider);
    expect(getRegisteredTracerProvider()).toBe(firstProvider);
    expect(getRegisteredSpanProcessor()).toBeInstanceOf(LangfuseSpanProcessor);
    expect(registerSpy).toHaveBeenCalledTimes(1);

    // Segunda chamada no mesmo processo deve ser idempotente
    const secondProvider = registerLangfuseTelemetry(env);
    expect(secondProvider).toBe(firstProvider);
    expect(registerSpy).toHaveBeenCalledTimes(1);
  });

  it('cria um novo CallbackHandler (@langfuse/langchain) a cada chamada de graph.invoke() e graph.stream() quando configurado', async () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test-123');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test-456');

    const handlerfirst = withLangfuseCallbacks({ streamMode: 'updates' });
    const handlerSecond = withLangfuseCallbacks({ streamMode: 'updates' });

    expect(Array.isArray(handlerfirst?.callbacks)).toBe(true);
    expect(Array.isArray(handlerSecond?.callbacks)).toBe(true);

    const cb1 = handlerfirst?.callbacks[0];
    const cb2 = handlerSecond?.callbacks[0];

    expect(cb1).toBeInstanceOf(CallbackHandler);
    expect(cb2).toBeInstanceOf(CallbackHandler);
    expect(cb1).not.toBe(cb2);

    // Valida que graph.invoke() e graph.stream() continuam funcionando com e sem chaves
    const graph = createAgentGraph({
      embeddingClient: {
        generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      searchSimilar: vi.fn().mockResolvedValue([]),
      searchProvider: { search: vi.fn().mockResolvedValue([]) },
      llmClient: vi.fn().mockResolvedValue({ sufficient: true, missingAspects: [] }),
      answerLlmClient: vi.fn().mockResolvedValue('Resposta instrumentada.'),
    });

    const invokeResult = await graph.invoke({ question: 'Teste invoke' });
    expect(invokeResult.answer).toContain('Resposta instrumentada.');

    const chunks: unknown[] = [];
    const stream = await graph.stream({ question: 'Teste stream' }, { streamMode: 'updates' });
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});
