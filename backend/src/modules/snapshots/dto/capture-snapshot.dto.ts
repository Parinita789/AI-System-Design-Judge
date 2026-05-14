import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class SnapshotArtifactsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  planMd?: string;
}

export class CaptureSnapshotDto {
  @IsInt()
  @Min(0)
  elapsedMinutes!: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SnapshotArtifactsDto)
  artifacts?: SnapshotArtifactsDto;
}
