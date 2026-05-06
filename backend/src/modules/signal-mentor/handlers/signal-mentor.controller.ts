import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SignalMentorService } from '../services/signal-mentor.service';
import { GenerateSignalMentorDto } from '../dto/generate-signal-mentor.dto';

@Controller('signal-mentor')
export class SignalMentorController {
  constructor(private readonly signalMentorService: SignalMentorService) {}

  @Get(':evaluationId')
  get(@Param('evaluationId') evaluationId: string) {
    return this.signalMentorService.getByEvaluation(evaluationId);
  }

  @Post(':evaluationId')
  generate(
    @Param('evaluationId') evaluationId: string,
    @Body() body?: GenerateSignalMentorDto,
  ) {
    return this.signalMentorService.generate(evaluationId, body?.model);
  }
}
