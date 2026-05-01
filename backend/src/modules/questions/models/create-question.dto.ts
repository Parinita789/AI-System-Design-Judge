import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Mode, Seniority } from '../../evaluations/models/rubric.types';

export class CreateQuestionDto {
  @IsString()
  @MinLength(10)
  prompt!: string;

  // Optional. If absent, the backend infers the rubric variant from the
  // prompt via classifyMode(). Only meaningful for v2.0+ rubrics; v1.0
  // ignores this field.
  @IsOptional()
  @IsIn(['build', 'design'])
  mode?: Mode;

  // Optional seniority calibration for the first attempt. Defaults to
  // 'senior' on v2.0+ when absent. v1.0 ignores this field.
  @IsOptional()
  @IsIn(['junior', 'mid', 'senior', 'staff'])
  seniority?: Seniority;
}

// Body for POST /questions/:id/attempts. Optional seniority override —
// when absent, the new attempt inherits from the most recent prior
// sibling.
export class StartAttemptDto {
  @IsOptional()
  @IsIn(['junior', 'mid', 'senior', 'staff'])
  seniority?: Seniority;
}
