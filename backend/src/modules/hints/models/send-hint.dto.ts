import { IsString, MaxLength, MinLength } from 'class-validator';
import { HINT_MESSAGE_MAX_CHARS } from '../constants';

export class SendHintDto {
  @IsString()
  @MinLength(1)
  @MaxLength(HINT_MESSAGE_MAX_CHARS)
  message!: string;
}
