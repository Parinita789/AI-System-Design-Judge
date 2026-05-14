import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  QUESTION_KINDS,
  QuestionKind,
  SENIORITIES,
  Seniority,
} from '../../evaluations/types/rubric.types';

export class CreateQuestionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(50_000)
  prompt!: string;

  @IsOptional()
  @IsIn(QUESTION_KINDS as readonly string[])
  kind?: QuestionKind;

  @IsOptional()
  @IsIn(SENIORITIES as readonly string[])
  seniority?: Seniority;
}

export class StartAttemptDto {
  @IsOptional()
  @IsIn(SENIORITIES as readonly string[])
  seniority?: Seniority;
}
