import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MentorService } from '../services/mentor.service';
import { GenerateMentorDto } from '../dto/generate-mentor.dto';

@Controller('mentor')
export class MentorController {
  constructor(private readonly mentorService: MentorService) {}

  @Get(':evaluationId')
  get(@Param('evaluationId') evaluationId: string) {
    return this.mentorService.getByEvaluation(evaluationId);
  }

  @Post(':evaluationId')
  generate(
    @Param('evaluationId') evaluationId: string,
    @Body() body?: GenerateMentorDto,
  ) {
    return this.mentorService.generate(evaluationId, body?.model);
  }
}
