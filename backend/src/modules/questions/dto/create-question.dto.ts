import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Mode, Seniority } from '../../evaluations/types/rubric.types';

export class CreateQuestionDto {
  @IsString()
  @MinLength(10)
  prompt!: string;

  @IsOptional()
  @IsIn(['build', 'design'])
  mode?: Mode;

  @IsOptional()
  @IsIn(['junior', 'mid', 'senior', 'staff'])
  seniority?: Seniority;
}

export class StartAttemptDto {
  @IsOptional()
  @IsIn(['junior', 'mid', 'senior', 'staff'])
  seniority?: Seniority;
}
