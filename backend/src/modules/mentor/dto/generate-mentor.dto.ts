import { IsOptional, IsString } from 'class-validator';

export class GenerateMentorDto {
  @IsOptional()
  @IsString()
  model?: string;
}
