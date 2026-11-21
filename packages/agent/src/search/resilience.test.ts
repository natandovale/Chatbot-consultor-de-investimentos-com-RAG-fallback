import { describe, expect, it, vi } from 'vitest';
import { comResiliencia, CircuitBreakerOpenError, type SearchProvider } from './index.js';

describe('comResiliencia', () => {
  it('executa com sucesso de primeira sem disparar sleep nem alterar circuit breaker', async () => {
    const fakeProvider: SearchProvider = {
      search: vi
        .fn()
        .mockResolvedValue([{ title: 'Doc', url: 'https://exemplo.com', snippet: 'resumo' }]),
    };

    const mockSleep = vi.fn();
    const resilientProvider = comResiliencia(fakeProvider, { sleep: mockSleep });

    const results = await resilientProvider.search('minerio');

    expect(results).toHaveLength(1);
    expect(fakeProvider.search).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
    expect(resilientProvider.getCircuitState()).toBe('CLOSED');
    expect(resilientProvider.getConsecutiveFailures()).toBe(0);
  });

  it('realiza retry com backoff exponencial injetável em caso de falha transitória e recupera com sucesso', async () => {
    let chamada = 0;
    const fakeProvider: SearchProvider = {
      search: vi.fn().mockImplementation(async () => {
        chamada++;
        if (chamada === 1) {
          throw new Error('Falha transitória na rede');
        }
        return [{ title: 'Doc Sucesso', url: 'https://sucesso.com', snippet: 'ok' }];
      }),
    };

    const delaysChamados: number[] = [];
    const mockSleep = vi.fn().mockImplementation(async (ms: number) => {
      delaysChamados.push(ms);
    });

    const resilientProvider = comResiliencia(fakeProvider, {
      maxRetries: 2,
      initialDelayMs: 200,
      backoffFactor: 2,
      sleep: mockSleep,
    });

    const results = await resilientProvider.search('query teste');

    expect(results).toHaveLength(1);
    expect(fakeProvider.search).toHaveBeenCalledTimes(2);
    expect(mockSleep).toHaveBeenCalledTimes(1);
    // Backoff inicial de 200ms na tentativa 0 (200 * 2^0)
    expect(delaysChamados).toEqual([200]);
    expect(resilientProvider.getCircuitState()).toBe('CLOSED');
    expect(resilientProvider.getConsecutiveFailures()).toBe(0);
  });

  it('esgota todas as tentativas de retry com delays exponenciais e repassa o erro original', async () => {
    const fakeProvider: SearchProvider = {
      search: vi.fn().mockRejectedValue(new Error('Erro persistente na API')),
    };

    const delaysChamados: number[] = [];
    const mockSleep = vi.fn().mockImplementation(async (ms: number) => {
      delaysChamados.push(ms);
    });

    const resilientProvider = comResiliencia(fakeProvider, {
      maxRetries: 2,
      initialDelayMs: 100,
      backoffFactor: 3,
      sleep: mockSleep,
    });

    await expect(resilientProvider.search('teste')).rejects.toThrow('Erro persistente na API');

    // 1 chamada original + 2 retries = 3 chamadas
    expect(fakeProvider.search).toHaveBeenCalledTimes(3);
    // Delays: 100 * 3^0 = 100, 100 * 3^1 = 300
    expect(delaysChamados).toEqual([100, 300]);
    expect(resilientProvider.getConsecutiveFailures()).toBe(1);
  });

  describe('Circuit Breaker com relógio injetável (now)', () => {
    it('abre o circuito após o limite de falhas consecutivas e rejeita chamadas subsequentes na hora', async () => {
      const currentTime = 1000;
      const fakeClock = () => currentTime;
      const mockSleep = vi.fn().mockResolvedValue(undefined);

      const fakeProvider: SearchProvider = {
        search: vi.fn().mockRejectedValue(new Error('Serviço fora do ar')),
      };

      const resilientProvider = comResiliencia(fakeProvider, {
        maxRetries: 0, // sem retry para testar direto as falhas da requisição
        consecutiveFailuresThreshold: 2,
        cooldownMs: 15000,
        sleep: mockSleep,
        now: fakeClock,
      });

      // Falha 1
      await expect(resilientProvider.search('q1')).rejects.toThrow('Serviço fora do ar');
      expect(resilientProvider.getCircuitState()).toBe('CLOSED');
      expect(resilientProvider.getConsecutiveFailures()).toBe(1);

      // Falha 2 -> Atinge o limite de 2 falhas consecutivas -> Abre o circuito
      await expect(resilientProvider.search('q2')).rejects.toThrow('Serviço fora do ar');
      expect(resilientProvider.getCircuitState()).toBe('OPEN');
      expect(resilientProvider.getConsecutiveFailures()).toBe(2);

      expect(fakeProvider.search).toHaveBeenCalledTimes(2);

      // Próxima chamada enquanto o circuito está ABERTO:
      // Falha NA HORA com CircuitBreakerOpenError SEM chamar o provedor
      await expect(resilientProvider.search('q3')).rejects.toThrow(CircuitBreakerOpenError);
      await expect(resilientProvider.search('q3')).rejects.toThrow(/Circuito aberto/);

      // O provedor externo NÃO foi chamado novamente!
      expect(fakeProvider.search).toHaveBeenCalledTimes(2);
    });

    it('transiciona para HALF_OPEN após o tempo de resfriamento e fecha o circuito se a chamada de teste suceder', async () => {
      let currentTime = 10000;
      const fakeClock = () => currentTime;
      const mockSleep = vi.fn().mockResolvedValue(undefined);

      let deveFalhar = true;
      const fakeProvider: SearchProvider = {
        search: vi.fn().mockImplementation(async () => {
          if (deveFalhar) {
            throw new Error('Erro temporário');
          }
          return [{ title: 'Recuperado', url: 'https://ok.com', snippet: 'ok' }];
        }),
      };

      const resilientProvider = comResiliencia(fakeProvider, {
        maxRetries: 0,
        consecutiveFailuresThreshold: 1,
        cooldownMs: 20000,
        sleep: mockSleep,
        now: fakeClock,
      });

      // Falha e abre o circuito imediatamente
      await expect(resilientProvider.search('q1')).rejects.toThrow('Erro temporário');
      expect(resilientProvider.getCircuitState()).toBe('OPEN');

      // Avança o relógio 10s (ainda dentro do resfriamento de 20s)
      currentTime += 10000;
      expect(resilientProvider.getCircuitState()).toBe('OPEN');
      await expect(resilientProvider.search('q2')).rejects.toThrow(CircuitBreakerOpenError);

      // Avança o relógio mais 11s (total 21s > cooldownMs 20s) -> Deve permitir teste (HALF_OPEN)
      currentTime += 11000;
      expect(resilientProvider.getCircuitState()).toBe('HALF_OPEN');

      // O serviço externo se recuperou
      deveFalhar = false;
      const results = await resilientProvider.search('q3-recuperacao');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Recuperado');
      // Circuito fechado novamente e falhas zeradas
      expect(resilientProvider.getCircuitState()).toBe('CLOSED');
      expect(resilientProvider.getConsecutiveFailures()).toBe(0);
    });

    it('reabre o circuito se a chamada no estado HALF_OPEN falhar', async () => {
      let currentTime = 5000;
      const fakeClock = () => currentTime;
      const mockSleep = vi.fn().mockResolvedValue(undefined);

      const fakeProvider: SearchProvider = {
        search: vi.fn().mockRejectedValue(new Error('Ainda instável')),
      };

      const resilientProvider = comResiliencia(fakeProvider, {
        maxRetries: 0,
        consecutiveFailuresThreshold: 1,
        cooldownMs: 10000,
        sleep: mockSleep,
        now: fakeClock,
      });

      // Abre circuito
      await expect(resilientProvider.search('q1')).rejects.toThrow('Ainda instável');
      expect(resilientProvider.getCircuitState()).toBe('OPEN');

      // Passa o cooldown
      currentTime += 15000;
      expect(resilientProvider.getCircuitState()).toBe('HALF_OPEN');

      // Tentativa de sondagem falha -> reabre circuito imediatamente
      await expect(resilientProvider.search('q-probe')).rejects.toThrow('Ainda instável');
      expect(resilientProvider.getCircuitState()).toBe('OPEN');
    });
  });
});
