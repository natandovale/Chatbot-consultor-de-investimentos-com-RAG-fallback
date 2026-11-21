import { describe, expect, it, vi } from 'vitest';
import {
  limparDocumentosWebExpirados,
  salvarDocumentosWeb,
  type WebChunkInput,
} from './web-documents.js';
import type { DbClient } from './retrieve-similar.js';

describe('web-documents TTL and persistence', () => {
  it('deve calcular expiresAt baseado no TTL de 7 dias por padrão', async () => {
    let insertedRecords: Array<{ fetchedAt: Date; expiresAt: Date }> = [];
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((records) => {
          insertedRecords = records;
          return Promise.resolve();
        }),
      }),
    } as unknown as DbClient;

    const fakeNow = new Date('2026-11-21T12:00:00Z');
    const chunks: WebChunkInput[] = [
      {
        query: 'notícia vale',
        title: 'Vale 3T25',
        content: 'Conteúdo da notícia...',
        sourceUrl: 'https://exemplo.com/noticia',
        embedding: [0.1, 0.2],
        fetchedAt: fakeNow,
      },
    ];

    const count = await salvarDocumentosWeb(mockDb, chunks, 7);

    expect(count).toBe(1);
    expect(insertedRecords.length).toBe(1);

    const record = insertedRecords[0];
    expect(record.fetchedAt).toEqual(fakeNow);

    // 7 dias depois: 2026-11-28
    const expectedExpiry = new Date('2026-11-28T12:00:00Z');
    expect(record.expiresAt).toEqual(expectedExpiry);
  });

  it('deve respeitar um TTL customizado por chunk se fornecido', async () => {
    let insertedRecords: Array<{ fetchedAt: Date; expiresAt: Date }> = [];
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((records) => {
          insertedRecords = records;
          return Promise.resolve();
        }),
      }),
    } as unknown as DbClient;

    const fakeNow = new Date('2026-11-21T12:00:00Z');
    const chunks: WebChunkInput[] = [
      {
        query: 'fato relevante',
        title: 'Fato Relevante Rápido',
        content: 'Conteúdo volátil...',
        sourceUrl: 'https://exemplo.com/fato',
        embedding: [0.1],
        fetchedAt: fakeNow,
        ttlDays: 3, // TTL menor de 3 dias
      },
    ];

    await salvarDocumentosWeb(mockDb, chunks);

    const record = insertedRecords[0];
    const diffDias =
      (record.expiresAt.getTime() - record.fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDias).toBe(3);
  });

  it('deve expurgar registros expirados via limparDocumentosWebExpirados', async () => {
    const mockDeletedIds = [{ id: 'expirado-1' }, { id: 'expirado-2' }];
    const mockDb = {
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(mockDeletedIds),
        }),
      }),
    } as unknown as DbClient;

    const dataCorte = new Date('2026-11-21T15:00:00Z');
    const removidos = await limparDocumentosWebExpirados(mockDb, dataCorte);

    expect(removidos).toBe(2);
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
