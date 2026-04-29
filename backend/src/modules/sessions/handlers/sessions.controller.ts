import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SessionsService } from '../services/sessions.service';
import { CreateSessionDto } from '../models/create-session.dto';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  start(@Body() dto: CreateSessionDto) {
    return this.sessionsService.start(dto);
  }

  @Post(':id/end')
  end(@Param('id') id: string) {
    return this.sessionsService.end(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.sessionsService.get(id);
  }

  @Get()
  list() {
    return this.sessionsService.list();
  }
}
