import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SessionsService } from '../services/sessions.service';
import { EndSessionDto } from '../dto/end-session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // Note: starting a session and creating a new attempt of an existing
  // question both happen via the QuestionsController. A Session never
  // exists without a parent Question.

  @Post(':id/end')
  end(@Param('id') id: string, @Body() dto: EndSessionDto) {
    return this.sessionsService.end(id, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    // Always include the parent question so the UI can render the prompt
    // without a second round-trip.
    return this.sessionsService.getWithQuestion(id);
  }

  @Get()
  list() {
    return this.sessionsService.list();
  }
}
