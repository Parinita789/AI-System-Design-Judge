import { IsInt, Min } from 'class-validator';

export class CaptureSnapshotDto {
  @IsInt()
  @Min(0)
  elapsedMinutes!: number;
}
