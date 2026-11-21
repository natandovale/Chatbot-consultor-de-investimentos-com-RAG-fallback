import { z } from 'zod';

export const chatRequestSchema = z.object({
  question: z.string({ message: 'Pergunta é obrigatória' }).trim().min(1, 'Pergunta é obrigatória'),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const resumoDocumentoSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  sourceUrl: z.string(),
  ticker: z.string().optional(),
  period: z.string().optional(),
  sourceType: z.string().optional(),
});

export type ResumoDocumento = z.infer<typeof resumoDocumentoSchema>;

export const retrieveChatEventSchema = z.object({
  node: z.literal('retrieve'),
  documents: z.array(resumoDocumentoSchema),
});

export type RetrieveChatEvent = z.infer<typeof retrieveChatEventSchema>;

export const gradeChatEventSchema = z.object({
  node: z.literal('grade'),
  sufficient: z.boolean(),
  missingAspects: z.array(z.string()),
  iterations: z.number(),
});

export type GradeChatEvent = z.infer<typeof gradeChatEventSchema>;

export const webSearchChatEventSchema = z.object({
  node: z.literal('webSearch'),
});

export type WebSearchChatEvent = z.infer<typeof webSearchChatEventSchema>;

export const answerChatEventSchema = z.object({
  node: z.literal('answer'),
  answer: z.string(),
});

export type AnswerChatEvent = z.infer<typeof answerChatEventSchema>;

export const errorChatEventSchema = z.object({
  node: z.literal('error'),
  error: z.string(),
});

export type ErrorChatEvent = z.infer<typeof errorChatEventSchema>;

export const chatStreamEventSchema = z.discriminatedUnion('node', [
  retrieveChatEventSchema,
  gradeChatEventSchema,
  webSearchChatEventSchema,
  answerChatEventSchema,
]);

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

export const chatEventSchema = z.discriminatedUnion('node', [
  retrieveChatEventSchema,
  gradeChatEventSchema,
  webSearchChatEventSchema,
  answerChatEventSchema,
  errorChatEventSchema,
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
