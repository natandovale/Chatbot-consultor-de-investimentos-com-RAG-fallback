import { AIMessage } from '@langchain/core/messages';
import type { Serialized } from '@langchain/core/load/serializable';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertDailyTokenBudget,
  criarMetricsCallback,
  DailyTokenBudgetExceededError,
  getDailyTokensUsed,
  llmCostUsdTotal,
  llmTokensTotal,
  metricsRegistry,
  MODEL_PRICING_USD_PER_MILLION,
  resetMetrics,
} from './metrics.js';

const FAKE_SERIALIZED_LLM: Serialized = {
  lc: 1,
  type: 'not_implemented',
  id: ['langchain', 'chat_models', 'vertexai', 'ChatVertexAI'],
};

describe('Métricas Prometheus do LLM (llm_tokens_total e llm_cost_usd_total)', () => {
  beforeEach(() => {
    resetMetrics();
    vi.restoreAllMocks();
  });

  it('correlaciona handleChatModelStart e handleLLMEnd por runId usando metadata.langgraph_node e metadata.ls_model_name e incrementa tokens e custo real em USD', async () => {
    const callback = criarMetricsCallback();

    await callback.handleChatModelStart(
      FAKE_SERIALIZED_LLM,
      [[]],
      'run-grade-1',
      undefined,
      undefined,
      undefined,
      {
        langgraph_node: 'grade',
        ls_model_name: 'gemini-3.5-flash-lite',
      },
    );

    await callback.handleChatModelStart(
      FAKE_SERIALIZED_LLM,
      [[]],
      'run-answer-1',
      undefined,
      undefined,
      undefined,
      {
        langgraph_node: 'answer',
        ls_model_name: 'gemini-3.6-flash',
      },
    );

    // Finaliza primeiro o run-answer-1 e depois o run-grade-1 para provar correlação por runId
    await callback.handleLLMEnd(
      {
        generations: [
          [
            {
              text: 'Resposta final',
              message: new AIMessage({
                content: 'Resposta final',
                usage_metadata: {
                  input_tokens: 2_000,
                  output_tokens: 500,
                  total_tokens: 2_500,
                },
              }),
            },
          ],
        ],
      },
      'run-answer-1',
    );

    await callback.handleLLMEnd(
      {
        generations: [
          [
            {
              text: '{"sufficient":true,"missingAspects":[]}',
              message: new AIMessage({
                content: '{"sufficient":true,"missingAspects":[]}',
                usage_metadata: {
                  input_tokens: 1_000,
                  output_tokens: 100,
                  total_tokens: 1_100,
                },
              }),
            },
          ],
        ],
      },
      'run-grade-1',
    );

    const metricsJson = await metricsRegistry.getMetricsAsJSON();
    const tokensMetric = metricsJson.find((m) => m.name === 'llm_tokens_total');
    const costMetric = metricsJson.find((m) => m.name === 'llm_cost_usd_total');

    expect(tokensMetric).toBeDefined();
    expect(costMetric).toBeDefined();

    // Verifica contadores de tokens para grade (gemini-3.5-flash-lite) e answer (gemini-3.6-flash)
    expect(tokensMetric?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { node: 'grade', model: 'gemini-3.5-flash-lite', kind: 'input' },
          value: 1_000,
        }),
        expect.objectContaining({
          labels: { node: 'grade', model: 'gemini-3.5-flash-lite', kind: 'output' },
          value: 100,
        }),
        expect.objectContaining({
          labels: { node: 'answer', model: 'gemini-3.6-flash', kind: 'input' },
          value: 2_000,
        }),
        expect.objectContaining({
          labels: { node: 'answer', model: 'gemini-3.6-flash', kind: 'output' },
          value: 500,
        }),
      ]),
    );

    // Verifica cálculo de custo USD a partir da tabela de preços por 1M de tokens
    const expectedGradeCost =
      (1_000 / 1_000_000) * MODEL_PRICING_USD_PER_MILLION['gemini-3.5-flash-lite']!.input +
      (100 / 1_000_000) * MODEL_PRICING_USD_PER_MILLION['gemini-3.5-flash-lite']!.output;
    const expectedAnswerCost =
      (2_000 / 1_000_000) * MODEL_PRICING_USD_PER_MILLION['gemini-3.6-flash']!.input +
      (500 / 1_000_000) * MODEL_PRICING_USD_PER_MILLION['gemini-3.6-flash']!.output;

    const gradeCostEntry = costMetric?.values.find(
      (v) => v.labels['node'] === 'grade' && v.labels['model'] === 'gemini-3.5-flash-lite',
    );
    const answerCostEntry = costMetric?.values.find(
      (v) => v.labels['node'] === 'answer' && v.labels['model'] === 'gemini-3.6-flash',
    );

    expect(gradeCostEntry?.value).toBeCloseTo(expectedGradeCost, 10);
    expect(answerCostEntry?.value).toBeCloseTo(expectedAnswerCost, 10);
  });

  it('loga aviso e contabiliza custo zero sem lançar exceção quando o modelo está fora da tabela de preços', async () => {
    const warnSpy = vi.fn();
    const callback = criarMetricsCallback({ warn: warnSpy });

    await callback.handleChatModelStart(
      FAKE_SERIALIZED_LLM,
      [[]],
      'run-unknown-model',
      undefined,
      undefined,
      undefined,
      {
        langgraph_node: 'answer',
        ls_model_name: 'gemini-99.9-experimental',
      },
    );

    await expect(
      callback.handleLLMEnd(
        {
          generations: [
            [
              {
                text: 'Ok',
                message: new AIMessage({
                  content: 'Ok',
                  usage_metadata: {
                    input_tokens: 500,
                    output_tokens: 200,
                    total_tokens: 700,
                  },
                }),
              },
            ],
          ],
        },
        'run-unknown-model',
      ),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('gemini-99.9-experimental');

    const tokensMetric = (await llmTokensTotal.get()).values;
    expect(tokensMetric).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { node: 'answer', model: 'gemini-99.9-experimental', kind: 'input' },
          value: 500,
        }),
        expect.objectContaining({
          labels: { node: 'answer', model: 'gemini-99.9-experimental', kind: 'output' },
          value: 200,
        }),
      ]),
    );

    const costMetric = (await llmCostUsdTotal.get()).values;
    expect(costMetric).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { node: 'answer', model: 'gemini-99.9-experimental' },
          value: 0,
        }),
      ]),
    );
  });

  it('nunca estima tokens quando usage_metadata não é devolvido pela resposta', async () => {
    const callback = criarMetricsCallback();

    await callback.handleChatModelStart(
      FAKE_SERIALIZED_LLM,
      [[]],
      'run-no-usage',
      undefined,
      undefined,
      undefined,
      {
        langgraph_node: 'grade',
        ls_model_name: 'gemini-3.5-flash-lite',
      },
    );

    await callback.handleLLMEnd(
      {
        generations: [[{ text: 'Texto sem usage_metadata' }]],
      },
      'run-no-usage',
    );

    expect((await llmTokensTotal.get()).values).toHaveLength(0);
    expect((await llmCostUsdTotal.get()).values).toHaveLength(0);
  });

  it('alimenta o budget diário em memória pela mesma fonte de usage_metadata do callback e zera na virada do dia UTC', async () => {
    let currentUtcTime = new Date('2026-11-22T23:59:50.000Z');
    const callback = criarMetricsCallback({ now: () => currentUtcTime });

    await callback.handleChatModelStart(
      FAKE_SERIALIZED_LLM,
      [[]],
      'run-budget-1',
      undefined,
      undefined,
      undefined,
      {
        langgraph_node: 'answer',
        ls_model_name: 'gemini-3.6-flash',
      },
    );

    await callback.handleLLMEnd(
      {
        generations: [
          [
            {
              text: 'Resposta',
              message: new AIMessage({
                content: 'Resposta',
                usage_metadata: {
                  input_tokens: 700,
                  output_tokens: 300,
                  total_tokens: 1_000,
                },
              }),
            },
          ],
        ],
      },
      'run-budget-1',
    );

    expect(getDailyTokensUsed(currentUtcTime)).toBe(1_000);
    expect(() =>
      assertDailyTokenBudget(currentUtcTime, { DAILY_TOKEN_BUDGET: '1000' }),
    ).toThrowError(DailyTokenBudgetExceededError);

    // Avança para o dia UTC seguinte (00:00:01Z) -> orçamento deve zerar automaticamente
    currentUtcTime = new Date('2026-11-23T00:00:01.000Z');
    expect(getDailyTokensUsed(currentUtcTime)).toBe(0);
    expect(() =>
      assertDailyTokenBudget(currentUtcTime, { DAILY_TOKEN_BUDGET: '1000' }),
    ).not.toThrow();
  });
});
