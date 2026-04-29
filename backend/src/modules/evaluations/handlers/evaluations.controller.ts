import { Controller, Get, Param } from '@nestjs/common';
import { EvaluationsService } from '../services/evaluations.service';

@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Get(':id/status')
  status(@Param('id') id: string) {
    return this.evaluationsService.getStatus(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.evaluationsService.getResult(id);
  }
}
