import type { FastifyInstance, FastifyError } from 'fastify';
import { ErrorCode } from '@axing/shared';

/**
 * Global error handler for consistent API error responses.
 * Catches unhandled errors and returns structured JSON.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _req, reply) => {
    const statusCode = error.statusCode || 500;

    // Classify error
    let code: string;
    let message: string;

    if (statusCode === 400) {
      code = ErrorCode.ValidationError;
      message = error.message || '请求参数错误';
    } else if (statusCode === 404) {
      code = 'NOT_FOUND';
      message = error.message || '资源不存在';
    } else if (statusCode === 409) {
      code = ErrorCode.InvalidTransition;
      message = error.message || '状态冲突';
    } else if (statusCode >= 500) {
      code = 'INTERNAL_ERROR';
      message = '服务器内部错误';
      // Log the real error server-side
      console.error(`[ErrorHandler] ${error.message}`, error.stack);
    } else {
      code = 'UNKNOWN';
      message = error.message || '未知错误';
    }

    return reply.status(statusCode).send({
      ok: false,
      error: message,
      code,
    });
  });

  // 404 handler for unmatched routes
  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send({
      ok: false,
      error: '接口不存在',
      code: 'NOT_FOUND',
    });
  });
}
