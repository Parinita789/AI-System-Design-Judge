import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuestionsService } from '../services/questions.service';
import { CreateQuestionDto, StartAttemptDto } from '../dto/create-question.dto';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  create(@Body() dto: CreateQuestionDto) {
    return this.questionsService.create(dto);
  }

  @Get()
  list() {
    return this.questionsService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.questionsService.get(id);
  }

  @Post(':id/attempts')
  startAttempt(@Param('id') id: string, @Body() body?: StartAttemptDto) {
    return this.questionsService.startAttempt(id, body?.seniority);
  }
}
