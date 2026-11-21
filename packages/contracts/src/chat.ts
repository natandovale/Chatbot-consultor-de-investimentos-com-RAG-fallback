import { z } from 'zod';

export const chatRequestSchema = z.object({
  question: z.string({ message: 'Pergunta é obrigatória' }).trim().min(1, 'Pergunta é obrigatória'),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
