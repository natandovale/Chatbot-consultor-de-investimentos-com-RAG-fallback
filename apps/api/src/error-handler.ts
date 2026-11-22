import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { CircuitoAbertoError, DailyTokenBudgetExceededError } from '@hero/agent';
import {
  PROBLEM_JSON_CONTENT_TYPE,
  problemDetailsSchema,
  type ProblemDetails,
} from '@hero/contracts';

function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'ZodError' &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

function isCircuitoAbertoError(error: unknown): error is CircuitoAbertoError {
  if (error instanceof CircuitoAbertoError) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    ((error as { name?: unknown }).name === 'CircuitoAbertoError' ||
      (error as { name?: unknown }).name === 'CircuitBreakerOpenError')
  );
}

function isTooManyRequestsError(error: unknown): error is Error & { statusCode?: number } {
  if (error instanceof DailyTokenBudgetExceededError) {
    return true;
  }
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const errRecord = error as { name?: unknown; statusCode?: unknown };
  return (
    errRecord.name === 'DailyTokenBudgetExceededError' ||
    errRecord.name === 'OrcamentoDiarioExcedidoError' ||
    errRecord.statusCode === 429
  );
}

/**
 * Error handler central da API no formato RFC 7807 (application/problem+json).
 * - ZodError -> 400 Bad Request
 * - Rate limit / DailyTokenBudgetExceededError -> 429 Too Many Requests
 * - CircuitoAbertoError -> 503 Service Unavailable
 * - Qualquer outro erro -> 500 Internal Server Error genérico (sem vazar detalhes internos ou stack trace)
 */
export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  if (isZodError(error)) {
    const detail =
      error.issues.map((issue) => issue.message).join('; ') || 'Dados inválidos na requisição.';

    const problem: ProblemDetails = problemDetailsSchema.parse({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail,
    });

    return reply.status(400).type(PROBLEM_JSON_CONTENT_TYPE).send(problem);
  }

  if (isTooManyRequestsError(error)) {
    const problem: ProblemDetails = problemDetailsSchema.parse({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: error.message || 'Limite de requisições ou orçamento diário de tokens excedido.',
    });

    return reply.status(429).type(PROBLEM_JSON_CONTENT_TYPE).send(problem);
  }

  if (isCircuitoAbertoError(error)) {
    const problem: ProblemDetails = problemDetailsSchema.parse({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      detail: error.message || 'Serviço de busca temporariamente indisponível (circuito aberto).',
    });

    return reply.status(503).type(PROBLEM_JSON_CONTENT_TYPE).send(problem);
  }

  const problem: ProblemDetails = problemDetailsSchema.parse({
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'Ocorreu um erro interno inesperado.',
  });

  return reply.status(500).type(PROBLEM_JSON_CONTENT_TYPE).send(problem);
}
