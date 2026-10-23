import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

const DEFAULT_AR: Record<number, string> = {
  400: 'طلب غير صالح',
  401: 'يجب تسجيل الدخول',
  403: 'ليس لديك صلاحية لهذا الإجراء',
  404: 'العنصر غير موجود',
  409: 'تعارض مع بيانات موجودة',
  429: 'طلبات كثيرة، حاول لاحقاً',
  500: 'حدث خطأ غير متوقع',
};

/** Normalises every error to `{ statusCode, message, messageAr?, ...extra }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === 'string' ? { message: r } : { ...(r as Record<string, unknown>) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        body = { message: 'Duplicate value', messageAr: 'القيمة مستخدمة مسبقاً' };
      } else if (exception.code === 'P2025') {
        status = 404;
        body = { message: 'Not found' };
      } else if (exception.code === 'P2003') {
        status = 400;
        body = { message: 'Invalid reference', messageAr: 'مرجع غير صالح' };
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = 400;
      body = { message: 'Invalid input' };
    }

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    if (Array.isArray(body.message)) {
      body.errors = body.message;
      body.message = (body.message as string[]).join('; ');
    }
    delete body.error;
    delete body.statusCode;
    if (!body.messageAr && DEFAULT_AR[status]) body.messageAr = DEFAULT_AR[status];

    res.status(status).json({ statusCode: status, ...body });
  }
}
