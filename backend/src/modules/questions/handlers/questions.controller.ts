import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuestionsService } from '../services/questions.service';
import { CreateQuestionDto } from '../models/create-question.dto';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // Create a new Question + its first Session in one call.
  @Post()
  create(@Body() dto: CreateQuestionDto) {
    return this.questionsService.create(dto);
  }

  // List of all questions for the sidebar — each row carries its sessions
  // + per-session phase evaluations so the UI can show attempts count + best score.
  @Get()
  list() {
    return this.questionsService.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.questionsService.get(id);
  }

  // Start a new attempt at this question. The new Session inherits the most
  // recently saved plan.md from any prior attempt of this question.
  @Post(':id/attempts')
  startAttempt(@Param('id') id: string) {
    return this.questionsService.startAttempt(id);
  }
}
