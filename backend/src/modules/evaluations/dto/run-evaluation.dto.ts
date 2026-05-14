import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RunEvaluationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}
