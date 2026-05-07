import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const ACTIONS = ['created', 'modified', 'deleted'] as const;

export class BuildEventDto {
  @IsString()
  @MaxLength(2048)
  filePath!: string;

  @IsIn(ACTIONS)
  action!: 'created' | 'modified' | 'deleted';

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  contentDiff?: string | null;

  @IsISO8601()
  occurredAt!: string;
}

export class BuildEventBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BuildEventDto)
  events!: BuildEventDto[];
}
