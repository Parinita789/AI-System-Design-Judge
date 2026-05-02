import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(exception.getResponse());
      return;
    }

    const message = (exception as Error)?.message ?? String(exception);
    const stack = (exception as Error)?.stack ?? '';
    this.logger.error(`${req.method} ${req.url} → ${message}\n${stack}`);

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: 'Internal server error',
      error: message,
    });
  }
}
