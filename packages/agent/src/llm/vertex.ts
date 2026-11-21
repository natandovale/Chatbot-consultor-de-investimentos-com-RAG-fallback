import { VertexAI } from '@google-cloud/vertexai';
import type { z } from 'zod';
import type { GradeLlmClient } from '../nodes/grade.js';
import type { AnswerLlmClient } from '../nodes/answer.js';

export interface VertexLlmOptions {
  projectId?: string;
  location?: string;
  model?: string;
}

export type VertexLlmClient = GradeLlmClient & AnswerLlmClient;

function cleanJsonResponse(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Cria o cliente reutilizável da Vertex AI que implementa tanto GradeLlmClient
 * (saída estruturada com Zod) quanto AnswerLlmClient (geração textual analítica).
 * A instância do SDK VertexAI é criada sob demanda.
 */
export function createVertexLlmClient(options: VertexLlmOptions = {}): VertexLlmClient {
  const projectId =
    options.projectId ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    'ai-researcher-capstone-study';
  const location = options.location || process.env.GCP_REGION || 'us-central1';
  const modelName =
    options.model ||
    process.env.GEMINI_MODEL ||
    process.env.VERTEX_MODEL ||
    'gemini-2.0-flash';

  let vertexInstance: VertexAI | null = null;
  function getVertex(): VertexAI {
    if (!vertexInstance) {
      vertexInstance = new VertexAI({
        project: projectId,
        location,
      });
    }
    return vertexInstance;
  }

  return {
    async generate({ system, prompt }): Promise<string> {
      const model = getVertex().getGenerativeModel({
        model: modelName,
        systemInstruction: system,
      });

      const result = await model.generateContent(prompt);
      const text =
        result.response.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('') ?? '';

      return text.trim();
    },

    async generateStructured<T>({
      system,
      prompt,
      schema,
    }: {
      system: string;
      prompt: string;
      schema: z.ZodType<T>;
    }): Promise<T> {
      const model = getVertex().getGenerativeModel({
        model: modelName,
        systemInstruction: system,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      });

      const result = await model.generateContent(prompt);
      const rawText =
        result.response.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('') ?? '{}';

      const parsed = JSON.parse(cleanJsonResponse(rawText));
      return schema.parse(parsed);
    },
  };
}

export function createGradeLlmClient(options?: VertexLlmOptions): GradeLlmClient {
  return createVertexLlmClient(options);
}

export function createAnswerLlmClient(options?: VertexLlmOptions): AnswerLlmClient {
  return createVertexLlmClient(options);
}
