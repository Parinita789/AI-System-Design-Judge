import { IsOptional, IsString } from 'class-validator';

export class GenerateSignalMentorDto {
  @IsOptional()
  @IsString()
  model?: string;
}
