import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BuildEventBatchDto } from '../dto/build-event.dto';
import { AuthedRequest, BuildSessionGuard, resolvedBuildSessionId } from '../guards/build-session.guard';
import { BuildSessionsService } from '../services/build-sessions.service';

@ApiTags('build-sessions')
@ApiBearerAuth('bearer')
@UseGuards(BuildSessionGuard)
@Controller('build')
export class BuildController {
  constructor(private readonly buildSessions: BuildSessionsService) {}

  @Post('events')
  @ApiOperation({
    summary: 'Append a batch of CLI-captured file events',
    description:
      'CLI watcher endpoint. Batched insert with an atomic counter bump on the parent session. The guard pulls the session id from the bearer token, so this route does not take a path parameter.',
  })
  async events(
    @Req() req: AuthedRequest,
    @Body() dto: BuildEventBatchDto,
  ) {
    const sessionId = resolvedBuildSessionId(req);
    const accepted = await this.buildSessions.insertEvents(sessionId, dto.events);
    return { accepted };
  }

  @Post('finish')
  @ApiOperation({
    summary: 'Mark the build phase finished (no more events accepted)',
    description:
      "Sets build_ended_at, freezing the build_events log. Idempotent on re-call. Phase 4's BuildAgent dispatch will hook in here.",
  })
  finish(@Req() req: AuthedRequest) {
    const sessionId = resolvedBuildSessionId(req);
    return this.buildSessions.finishBuildPhase(sessionId);
  }
}
