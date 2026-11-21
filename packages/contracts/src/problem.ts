import { z } from 'zod';

export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
});

export const problemSchema = problemDetailsSchema;
export const problemResponseSchema = problemDetailsSchema;

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export type Problem = ProblemDetails;
export type ProblemResponse = ProblemDetails;
