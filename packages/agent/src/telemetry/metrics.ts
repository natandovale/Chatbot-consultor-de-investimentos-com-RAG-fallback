import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import { Counter, Registry } from 'prom-client';

export interface ModelPricingUsdPerMillion {
  input: number;
  output: number;
}

/**
 * Tabela de preços em USD por 1 milhão de tokens (input e output).
 * Modelos configurados por variável de ambiente no projeto (CLAUDE.md):
 * - Nó `grade`: `gemini-3.5-flash-lite`
 * - Nó `answer`: `gemini-3.6-flash`
 */
export const MODEL_PRICING_USD_PER_MILLION: Readonly<Record<string, ModelPricingUsdPerMillion>> =
  Object.freeze({
    'gemini-3.5-flash-lite': { input: 0.075, output: 0.3 },
    'gemini-3.6-flash': { input: 0.15, output: 0.6 },
    'gemini-2.5-flash-lite': { input: 0.075, output: 0.3 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    'gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
    'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  });

export const TABELA_PRECOS_USD_POR_MILHAO = MODEL_PRICING_USD_PER_MILLION;

/**
 * Registry próprio do Prometheus (isolado do global default registry do prom-client).
 */
export const metricsRegistry = new Registry();

/**
 * Contador de tokens consumidos pelo LLM:
 * labels: `node`, `model`, `kind` ('input' | 'output').
 */
export const llmTokensTotal = new Counter({
  name: 'llm_tokens_total',
  help: 'Total de tokens consumidos pelo LLM por nó do grafo, modelo e tipo (input/output)',
  labelNames: ['node', 'model', 'kind'] as const,
  registers: [metricsRegistry],
});

export const llm_tokens_total = llmTokensTotal;

/**
 * Contador de custo acumulado em USD das chamadas ao LLM:
 * labels: `node`, `model`.
 */
export const llmCostUsdTotal = new Counter({
  name: 'llm_cost_usd_total',
  help: 'Custo acumulado em USD das chamadas ao LLM por nó do grafo e modelo',
  labelNames: ['node', 'model'] as const,
  registers: [metricsRegistry],
});

export const llm_cost_usd_total = llmCostUsdTotal;

export const DEFAULT_DAILY_TOKEN_BUDGET = 1_000_000;

/**
 * Erro de domínio lançado quando o orçamento diário de tokens em memória é atingido.
 * Mapeado pelo errorHandler central da API para HTTP 429 (application/problem+json).
 */
export class DailyTokenBudgetExceededError extends Error {
  readonly statusCode = 429;
  readonly usedTokens: number;
  readonly budgetLimit: number;
  readonly utcDay: string;

  constructor(params: { usedTokens: number; budgetLimit: number; utcDay: string }) {
    super(
      `Orçamento diário de tokens excedido para ${params.utcDay} (${params.usedTokens}/${params.budgetLimit} tokens).`,
    );
    this.name = 'DailyTokenBudgetExceededError';
    this.usedTokens = params.usedTokens;
    this.budgetLimit = params.budgetLimit;
    this.utcDay = params.utcDay;
  }
}

export { DailyTokenBudgetExceededError as OrcamentoDiarioExcedidoError };

function getUtcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

interface DailyBudgetState {
  utcDay: string;
  usedTokens: number;
}

const dailyBudgetState: DailyBudgetState = {
  utcDay: getUtcDayKey(),
  usedTokens: 0,
};

function syncUtcDay(now: Date = new Date()): string {
  const todayUtc = getUtcDayKey(now);
  if (dailyBudgetState.utcDay !== todayUtc) {
    dailyBudgetState.utcDay = todayUtc;
    dailyBudgetState.usedTokens = 0;
  }
  return todayUtc;
}

/**
 * Lê o limite diário de tokens a partir das variáveis de ambiente em runtime.
 */
export function getDailyTokenBudgetLimit(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw =
    env.DAILY_TOKEN_BUDGET ??
    env.TOKEN_BUDGET_DAILY ??
    env.DAILY_TOKEN_LIMIT ??
    env.MAX_DAILY_TOKENS ??
    env.TOKEN_BUDGET;

  if (raw !== undefined && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return DEFAULT_DAILY_TOKEN_BUDGET;
}

export const obterLimiteOrcamentoDiario = getDailyTokenBudgetLimit;

/**
 * Retorna a quantidade de tokens consumidos no dia UTC atual.
 * Zera automaticamente na virada do dia UTC.
 */
export function getDailyTokensUsed(now: Date = new Date()): number {
  syncUtcDay(now);
  return dailyBudgetState.usedTokens;
}

export const obterTokensDiariosUsados = getDailyTokensUsed;

/**
 * Alimenta o orçamento diário em memória com os tokens reais consumidos.
 * Chamado diretamente pelo `MetricsCallbackHandler` ao processar `usage_metadata`.
 */
export function recordDailyTokens(tokens: number, now: Date = new Date()): number {
  syncUtcDay(now);
  if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0) {
    dailyBudgetState.usedTokens += tokens;
  }
  return dailyBudgetState.usedTokens;
}

export const registrarTokensDiarios = recordDailyTokens;

/**
 * Verifica se o orçamento diário de tokens foi atingido ou ultrapassado no dia UTC atual.
 */
export function isDailyTokenBudgetExceeded(
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  const used = getDailyTokensUsed(now);
  const limit = getDailyTokenBudgetLimit(env);
  return used >= limit;
}

export const orcamentoDiarioExcedido = isDailyTokenBudgetExceeded;

/**
 * Verifica o orçamento diário de tokens e lança `DailyTokenBudgetExceededError` (HTTP 429)
 * caso o limite do dia UTC atual tenha sido atingido.
 */
export function assertDailyTokenBudget(
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
): void {
  const utcDay = syncUtcDay(now);
  const usedTokens = dailyBudgetState.usedTokens;
  const budgetLimit = getDailyTokenBudgetLimit(env);

  if (usedTokens >= budgetLimit) {
    throw new DailyTokenBudgetExceededError({
      usedTokens,
      budgetLimit,
      utcDay,
    });
  }
}

export const verificarOrcamentoDiario = assertDailyTokenBudget;

/**
 * Reseta o orçamento diário de tokens em memória (útil para testes unitários).
 */
export function resetDailyTokenBudget(now: Date = new Date()): void {
  dailyBudgetState.utcDay = getUtcDayKey(now);
  dailyBudgetState.usedTokens = 0;
}

export const resetarOrcamentoDiario = resetDailyTokenBudget;

interface RunCorrelationInfo {
  node: string;
  model: string;
}

export interface UsageMetadataLike {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface CreateMetricsCallbackOptions {
  registry?: Registry;
  tokensCounter?: Counter<'node' | 'model' | 'kind'>;
  costCounter?: Counter<'node' | 'model'>;
  pricingTable?: Readonly<Record<string, ModelPricingUsdPerMillion>>;
  warn?: (message: string) => void;
  now?: () => Date;
}

function extractUsageMetadataFromResult(output: LLMResult): UsageMetadataLike | null {
  if (!output || typeof output !== 'object') {
    return null;
  }

  if (Array.isArray(output.generations)) {
    for (const generationList of output.generations) {
      if (!Array.isArray(generationList)) {
        continue;
      }
      for (const generation of generationList) {
        if (!generation || typeof generation !== 'object') {
          continue;
        }
        const genRecord = generation as unknown as {
          message?: { usage_metadata?: UsageMetadataLike };
          usage_metadata?: UsageMetadataLike;
        };
        if (genRecord.message?.usage_metadata) {
          return genRecord.message.usage_metadata;
        }
        if (genRecord.usage_metadata) {
          return genRecord.usage_metadata;
        }
      }
    }
  }

  const llmOutputUsage = (output.llmOutput as { usage_metadata?: UsageMetadataLike } | undefined)
    ?.usage_metadata;
  if (llmOutputUsage) {
    return llmOutputUsage;
  }

  return null;
}

/**
 * Callback LangChain genérico que correlaciona `handleChatModelStart` e `handleLLMEnd`
 * por `runId`, lendo `metadata.langgraph_node` e `metadata.ls_model_name`, e incrementa
 * tanto os contadores Prometheus quanto o budget diário em memória a partir da mesma
 * fonte de tokens (`usage_metadata` real devolvido pela Vertex AI).
 */
export class MetricsCallbackHandler extends BaseCallbackHandler {
  name = 'PrometheusMetricsCallbackHandler';

  private readonly runsByRunId = new Map<string, RunCorrelationInfo>();
  private readonly tokensCounter: Counter<'node' | 'model' | 'kind'>;
  private readonly costCounter: Counter<'node' | 'model'>;
  private readonly pricingTable: Readonly<Record<string, ModelPricingUsdPerMillion>>;
  private readonly warn: (message: string) => void;
  private readonly now: () => Date;

  constructor(options: CreateMetricsCallbackOptions = {}) {
    super();
    this.tokensCounter = options.tokensCounter ?? llmTokensTotal;
    this.costCounter = options.costCounter ?? llmCostUsdTotal;
    this.pricingTable = options.pricingTable ?? MODEL_PRICING_USD_PER_MILLION;
    this.warn = options.warn ?? ((msg: string) => console.warn(msg));
    this.now = options.now ?? (() => new Date());
  }

  private recordRunStart(runId: string, metadata?: Record<string, unknown>): void {
    const rawNode = metadata?.['langgraph_node'];
    const rawModel = metadata?.['ls_model_name'];

    const node =
      typeof rawNode === 'string' && rawNode.trim().length > 0 ? rawNode.trim() : 'unknown';
    const model =
      typeof rawModel === 'string' && rawModel.trim().length > 0 ? rawModel.trim() : 'unknown';

    this.runsByRunId.set(runId, { node, model });
  }

  override async handleChatModelStart(
    _llm: Serialized,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.recordRunStart(runId, metadata);
  }

  override async handleLLMStart(
    _llm: Serialized,
    _prompts: string[],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.recordRunStart(runId, metadata);
  }

  override async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const correlation = this.runsByRunId.get(runId);
    this.runsByRunId.delete(runId);

    const node = correlation?.node ?? 'unknown';
    const model = correlation?.model ?? 'unknown';

    const usage = extractUsageMetadataFromResult(output);
    if (!usage) {
      return;
    }

    const hasInputTokens =
      typeof usage.input_tokens === 'number' && Number.isFinite(usage.input_tokens);
    const hasOutputTokens =
      typeof usage.output_tokens === 'number' && Number.isFinite(usage.output_tokens);

    if (!hasInputTokens && !hasOutputTokens) {
      return;
    }

    const inputTokens = hasInputTokens ? Math.max(0, usage.input_tokens!) : 0;
    const outputTokens = hasOutputTokens ? Math.max(0, usage.output_tokens!) : 0;

    this.tokensCounter.inc({ node, model, kind: 'input' }, inputTokens);
    this.tokensCounter.inc({ node, model, kind: 'output' }, outputTokens);

    // Alimenta o budget diário em memória a partir da mesma leitura de usage_metadata
    recordDailyTokens(inputTokens + outputTokens, this.now());

    const pricing = this.pricingTable[model];
    if (!pricing) {
      this.warn(
        `[metrics] Modelo "${model}" não encontrado na tabela de preços USD por milhão de tokens; contabilizando custo zero.`,
      );
      this.costCounter.inc({ node, model }, 0);
      return;
    }

    const costUsd =
      (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
    this.costCounter.inc({ node, model }, costUsd);
  }

  override async handleLLMError(_err: unknown, runId: string): Promise<void> {
    this.runsByRunId.delete(runId);
  }
}

/**
 * Cria uma nova instância do callback de métricas Prometheus para LangChain/LangGraph.
 */
export function criarMetricsCallback(
  options: CreateMetricsCallbackOptions = {},
): MetricsCallbackHandler {
  return new MetricsCallbackHandler(options);
}

export const createMetricsCallback = criarMetricsCallback;

/**
 * Reseta os contadores do Registry próprio e o budget diário em memória (útil para testes unitários).
 */
export function resetMetrics(): void {
  metricsRegistry.resetMetrics();
  resetDailyTokenBudget();
}
