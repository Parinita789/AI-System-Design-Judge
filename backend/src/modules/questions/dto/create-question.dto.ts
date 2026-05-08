import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { QuestionKind, Seniority } from '../../evaluations/types/rubric.types';

export class CreateQuestionDto {
  @IsString()
  @MinLength(10)
  prompt!: string;

  @IsOptional()
  @IsIn(['traditional_design', 'agentic_design', 'agentic_build'])
  kind?: QuestionKind;

  @IsOptional()
  @IsIn(['junior', 'mid', 'senior', 'staff'])
  seniority?: Seniority;
}

export class StartAttemptDto {
  @IsOptional()
  @IsIn(['junior', 'mid', 'senior', 'staff'])
  seniority?: Seniority;
}
