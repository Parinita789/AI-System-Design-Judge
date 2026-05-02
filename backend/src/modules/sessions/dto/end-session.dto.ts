import { IsIn, IsOptional } from 'class-validator';

export type SessionEndStatus = 'completed' | 'abandoned';

export class EndSessionDto {
  @IsOptional()
  @IsIn(['completed', 'abandoned'])
  status?: SessionEndStatus;
}
