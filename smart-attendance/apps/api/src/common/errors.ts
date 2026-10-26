import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode, bilingual } from '@sa/domain';
import type { Response } from 'express';

/** خطأ API برمز ثابت ورسالة عربية/إنجليزية (CLAUDE.md §5.5). */
export class ApiError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code }, status);
  }
}

export const forbidden = (code: ErrorCode = 'FORBIDDEN') => new ApiError(code, HttpStatus.FORBIDDEN);
export const notFound = () => new ApiError('NOT_FOUND', HttpStatus.NOT_FOUND);
export const unauthenticated = (code: ErrorCode = 'AUTH_UNAUTHENTICATED') =>
  new ApiError(code, HttpStatus.UNAUTHORIZED);
export const conflict = (code: ErrorCode) => new ApiError(code, HttpStatus.CONFLICT);
export const badRequest = (code: ErrorCode, details?: Record<string, unknown>) =>
  new ApiError(code, HttpStatus.BAD_REQUEST, details);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ApiError) {
      res.status(exception.getStatus()).json({
        error: { code: exception.code, ...bilingual(exception.code), ...(exception.details ?? {}) },
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 400 ? 'VALIDATION_FAILED'
        : status === 401 ? 'AUTH_UNAUTHENTICATED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : 'VALIDATION_FAILED';
      const body = exception.getResponse();
      const issues = typeof body === 'object' && body && 'message' in body ? body.message : undefined;
      res.status(status).json({ error: { code, ...bilingual(code), ...(issues ? { issues } : {}) } });
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ error: { code: 'INTERNAL', message_ar: 'خطأ داخلي.', message_en: 'Internal error.' } });
  }
}
