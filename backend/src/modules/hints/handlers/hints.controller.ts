import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { HintsService } from '../services/hints.service';
import { SendHintDto } from '../dto/send-hint.dto';

@Controller('sessions/:sessionId/hints')
export class HintsController {
  constructor(private readonly hintsService: HintsService) {}

  @Post()
  send(@Param('sessionId') sessionId: string, @Body() dto: SendHintDto) {
    return this.hintsService.send(sessionId, dto.message);
  }

  @Get()
  list(@Param('sessionId') sessionId: string) {
    return this.hintsService.list(sessionId);
  }
}
