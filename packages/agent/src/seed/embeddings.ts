import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'node:child_process';
import { EMBEDDING_DIMENSIONS } from '../db/schema.js';

export interface EmbeddingClient {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  embedDocuments?(texts: string[]): Promise<number[][]>;
  embedQuery?(text: string): Promise<number[]>;
  (text: string): Promise<number[]>;
}

export type EmbeddingClientLike = {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  embedDocuments?(texts: string[]): Promise<number[][]>;
  embedQuery?(text: string): Promise<number[]>;
};

export interface VertexEmbeddingOptions {
  projectId?: string;
  location?: string;
  model?: string;
  outputDimensionality?: number;
}

/**
 * Cria o cliente de embeddings reais em lote chamando a Vertex AI.
 * Usado pelo seed real (que nunca deve rodar em modo demo) e pelo grafo em produção.
 */
export function criarEmbeddingsReal(options: VertexEmbeddingOptions = {}): EmbeddingClient {
  const projectId =
    options.projectId ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'ai-researcher-capstone-study';
  const location = options.location || process.env.GCP_REGION || 'us-central1';
  const model =
    options.model ||
    process.env.MODEL_EMBEDDING ||
    process.env.EMBEDDING_MODEL ||
    'text-embedding-004';
  const outputDimensionality = options.outputDimensionality || EMBEDDING_DIMENSIONS;

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  async function getAccessToken(): Promise<string> {
    try {
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (token.token) return token.token;
    } catch {
      // Fallback para gcloud CLI caso ADC não esteja configurado no arquivo local
    }
    return execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
  }

  async function embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const token = await getAccessToken();
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: texts.map((text) => ({ content: text })),
        parameters: {
          outputDimensionality,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Falha ao gerar embeddings no Vertex AI (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      predictions: Array<{
        embeddings: {
          values: number[];
        };
      }>;
    };

    if (!data.predictions || data.predictions.length !== texts.length) {
      throw new Error(
        `Esperava ${texts.length} embeddings do Vertex AI, mas recebeu ${data.predictions?.length ?? 0}`,
      );
    }

    return data.predictions.map((p) => p.embeddings.values);
  }

  async function embedQuery(text: string): Promise<number[]> {
    const [vector] = await embedDocuments([text]);
    return vector ?? [];
  }

  const callable = async (text: string): Promise<number[]> => embedQuery(text);

  return Object.assign(callable, {
    generateEmbeddings: embedDocuments,
    embedDocuments,
    embedQuery,
  });
}

export const createRealEmbeddingClient = criarEmbeddingsReal;

/**
 * Cria o cliente de embeddings para modo DEMO: devolve um vetor de zeros.
 */
export function criarEmbeddingsDemo(dimensions: number = EMBEDDING_DIMENSIONS): EmbeddingClient {
  const zeroVector = () => new Array<number>(dimensions).fill(0);

  async function embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map(() => zeroVector());
  }

  async function embedQuery(): Promise<number[]> {
    return zeroVector();
  }

  const callable = async (): Promise<number[]> => embedQuery();

  return Object.assign(callable, {
    generateEmbeddings: embedDocuments,
    embedDocuments,
    embedQuery,
  });
}

export const createFakeEmbeddingClient = criarEmbeddingsDemo;

/**
 * Fábrica de embeddings para o grafo:
 * - Quando `env.DEMO === 'true'`, devolve um vetor de zeros sem tocar na Vertex AI.
 * - Caso contrário, delega para `criarEmbeddingsReal()`.
 */
export function criarEmbeddings(
  env: Record<string, string | undefined> = process.env,
  options: VertexEmbeddingOptions = {},
): EmbeddingClient {
  if (env.DEMO === 'true') {
    return criarEmbeddingsDemo(options.outputDimensionality ?? EMBEDDING_DIMENSIONS);
  }
  return criarEmbeddingsReal(options);
}

export const getEmbeddingClient = criarEmbeddings;
