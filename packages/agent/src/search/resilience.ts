import type { SearchProvider, SearchResult } from './types.js';

export class CircuitoAbertoError extends Error {
  constructor(
    message = 'Circuito aberto para o provedor de busca. Chamada rejeitada imediatamente.',
  ) {
    super(message);
    this.name = 'CircuitoAbertoError';
  }
}

export const CircuitBreakerOpenError = CircuitoAbertoError;
export type CircuitBreakerOpenError = CircuitoAbertoError;

export interface ResilienciaOptions {
  /**
   * Número máximo de tentativas extras em caso de erro.
   * Default: 2 (total de 3 tentativas por requisição).
   */
  maxRetries?: number;

  /**
   * Delay inicial em milissegundos para o cálculo do backoff exponencial.
   * Default: 500ms.
   */
  initialDelayMs?: number;

  /**
   * Fator multiplicador do backoff exponencial.
   * Default: 2.
   */
  backoffFactor?: number;

  /**
   * Quantidade de falhas consecutivas necessárias para abrir o circuito.
   * Default: 3.
   */
  consecutiveFailuresThreshold?: number;

  /**
   * Tempo de resfriamento em milissegundos em que o circuito fica aberto
   * antes de permitir uma tentativa de recuperação (half-open).
   * Default: 30000ms (30 segundos).
   */
  cooldownMs?: number;

  /**
   * Função de espera injetável para testes determinísticos sem atrasos reais.
   */
  sleep?: (ms: number) => Promise<void>;

  /**
   * Relógio injetável para consulta do timestamp atual (ms).
   */
  now?: () => number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ResilientSearchProvider extends SearchProvider {
  getCircuitState(): CircuitState;
  getConsecutiveFailures(): number;
  resetCircuit(): void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const defaultNow = () => Date.now();

/**
 * Decorador que envolve qualquer SearchProvider com:
 * 1. Retry e backoff exponencial em caso de falhas transitórias.
 * 2. Circuit Breaker: falhas consecutivas abrem o circuito, fazendo chamadas
 *    subsequentes falharem imediatamente sem onerar o provedor até que
 *    o tempo de resfriamento passe.
 *
 * @param provider Provedor de busca original
 * @param options Opções de resiliência e dependências injetáveis (sleep, now)
 */
export function comResiliencia(
  provider: SearchProvider,
  options: ResilienciaOptions = {},
): ResilientSearchProvider {
  const maxRetries = options.maxRetries ?? 2;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2;
  const consecutiveFailuresThreshold = options.consecutiveFailuresThreshold ?? 3;
  const cooldownMs = options.cooldownMs ?? 30000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? defaultNow;

  let consecutiveFailures = 0;
  let circuitState: CircuitState = 'CLOSED';
  let lastFailureTime = 0;

  return {
    async search(query: string): Promise<SearchResult[]> {
      const currentTime = now();

      // 1. Verificação de Circuit Breaker
      if (circuitState === 'OPEN') {
        if (currentTime - lastFailureTime >= cooldownMs) {
          circuitState = 'HALF_OPEN';
        } else {
          const restantesMs = cooldownMs - (currentTime - lastFailureTime);
          throw new CircuitBreakerOpenError(
            `Circuito aberto para o provedor de busca. Chamada rejeitada imediatamente (${Math.ceil(
              restantesMs / 1000,
            )}s restantes para resfriamento).`,
          );
        }
      }

      // 2. Tentativas com retry e backoff exponencial
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const results = await provider.search(query);

          // Sucesso: fecha o circuito e zera o contador de falhas
          consecutiveFailures = 0;
          circuitState = 'CLOSED';
          return results;
        } catch (error) {
          lastError = error;

          if (attempt < maxRetries) {
            const delay = initialDelayMs * Math.pow(backoffFactor, attempt);
            await sleep(delay);
          }
        }
      }

      // Todas as tentativas falharam nesta requisição
      consecutiveFailures++;
      lastFailureTime = now();

      if (circuitState === 'HALF_OPEN' || consecutiveFailures >= consecutiveFailuresThreshold) {
        circuitState = 'OPEN';
      }

      throw lastError;
    },

    getCircuitState() {
      const currentTime = now();
      if (circuitState === 'OPEN' && currentTime - lastFailureTime >= cooldownMs) {
        return 'HALF_OPEN';
      }
      return circuitState;
    },

    getConsecutiveFailures() {
      return consecutiveFailures;
    },

    resetCircuit() {
      consecutiveFailures = 0;
      circuitState = 'CLOSED';
      lastFailureTime = 0;
    },
  };
}
