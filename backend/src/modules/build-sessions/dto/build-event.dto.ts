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

  // Stable per-event hash supplied by the CLI. Lets a retried batch
  // dedupe at the DB layer (partial unique index) without the server
  // having to remember which batches it has already accepted.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class BuildEventBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BuildEventDto)
  events!: BuildEventDto[];
}
