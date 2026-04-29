import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SnapshotsService } from '../services/snapshots.service';
import { CaptureSnapshotDto } from '../models/capture-snapshot.dto';

@Controller('sessions/:sessionId/snapshots')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @Post()
  capture(@Param('sessionId') sessionId: string, @Body() dto: CaptureSnapshotDto) {
    return this.snapshotsService.capture(sessionId, dto);
  }

  @Get()
  list(@Param('sessionId') sessionId: string) {
    return this.snapshotsService.list(sessionId);
  }
}
