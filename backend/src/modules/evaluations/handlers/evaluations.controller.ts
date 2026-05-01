import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { EvaluationsService } from '../services/evaluations.service';

@Controller()
export class EvaluationsController {
  private readonly logger = new Logger(EvaluationsController.name);

  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('sessions/:sessionId/evaluate')
  async runForSession(@Param('sessionId') sessionId: string) {
    try {
      return await this.evaluationsService.runForSession(sessionId);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const stack = (err as Error).stack ?? '';
      this.logger.error(`Eval failed for ${sessionId}: ${message}\n${stack}`);
      // Surface the actual cause to the caller — this is a dev tool, no PII risk.
      throw new HttpException(
        { message: 'Evaluation failed', error: message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('sessions/:sessionId/evaluations')
  listForSession(@Param('sessionId') sessionId: string) {
    return this.evaluationsService.getBySession(sessionId);
  }

  @Get('evaluations/:id/status')
  status() {
    // Sync model — by the time the client can fetch this, the eval is already complete.
    return { state: 'complete' as const };
  }

  @Get('evaluations/:id')
  get(@Param('id') id: string) {
    return this.evaluationsService.getById(id);
  }

  @Get('evaluations/:id/audit')
  getAudit(@Param('id') id: string) {
    return this.evaluationsService.getAudit(id);
  }
}
