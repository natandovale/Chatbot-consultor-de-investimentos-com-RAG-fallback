import { GoogleAuth } from 'google-auth-library';
import { execSync } from 'node:child_process';
import { EMBEDDING_DIMENSIONS } from '../db/schema.js';

export interface EmbeddingClient {
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export interface VertexEmbeddingOptions {
  projectId?: string;
  location?: string;
  model?: string;
  outputDimensionality?: number;
}

/**
 * Cria o cliente de embeddings reais chamando a Vertex AI.
 * Separada em função própria para que o modo DEMO do projeto possa trocar isso por um fake sem chamar rede.
 */
export function createRealEmbeddingClient(options: VertexEmbeddingOptions = {}): EmbeddingClient {
  const projectId =
    options.projectId ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'ai-researcher-capstone-study';
  const location = options.location || process.env.GCP_REGION || 'us-central1';
  const model = options.model || process.env.EMBEDDING_MODEL || 'text-embedding-004';
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

  return {
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
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
        throw new Error(
          `Falha ao gerar embeddings no Vertex AI (${response.status}): ${errorText}`,
        );
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
    },
  };
}

/**
 * Cria o cliente de embeddings fake para modo DEMO / testes sem rede.
 */
export function createFakeEmbeddingClient(
  dimensions: number = EMBEDDING_DIMENSIONS,
): EmbeddingClient {
  return {
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
      return texts.map(() => Array.from({ length: dimensions }, () => Math.random() * 0.02 - 0.01));
    },
  };
}

/**
 * Retorna o cliente apropriado de acordo com a variável DEMO.
 */
export function getEmbeddingClient(): EmbeddingClient {
  if (process.env.DEMO === 'true') {
    return createFakeEmbeddingClient();
  }
  return createRealEmbeddingClient();
}
