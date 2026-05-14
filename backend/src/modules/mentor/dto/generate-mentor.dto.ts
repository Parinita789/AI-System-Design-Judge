import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateMentorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}
