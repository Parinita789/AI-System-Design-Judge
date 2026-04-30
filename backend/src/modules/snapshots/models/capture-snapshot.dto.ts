import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class SnapshotArtifactsDto {
  @IsOptional()
  @IsString()
  planMd?: string;
}

export class CaptureSnapshotDto {
  @IsInt()
  @Min(0)
  elapsedMinutes!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SnapshotArtifactsDto)
  artifacts?: SnapshotArtifactsDto;
}
