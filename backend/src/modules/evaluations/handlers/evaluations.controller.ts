import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EvaluationsService } from '../services/evaluations.service';
import { RunEvaluationDto } from '../dto/run-evaluation.dto';

@Controller()
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('sessions/:sessionId/evaluate')
  runForSession(
    @Param('sessionId') sessionId: string,
    @Body() body?: RunEvaluationDto,
  ) {
    return this.evaluationsService.runForSession(sessionId, body?.model);
  }

  @Get('sessions/:sessionId/evaluations')
  listForSession(@Param('sessionId') sessionId: string) {
    return this.evaluationsService.getBySession(sessionId);
  }

  @Get('evaluations/:id/status')
  status() {
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
