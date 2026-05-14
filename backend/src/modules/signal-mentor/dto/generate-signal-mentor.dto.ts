import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateSignalMentorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}
