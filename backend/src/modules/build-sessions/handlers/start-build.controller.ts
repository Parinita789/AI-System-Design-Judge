import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BuildSessionsService } from '../services/build-sessions.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OwnershipService } from '../../auth/services/ownership.service';
import { AuthenticatedUser } from '../../auth/types/auth.types';

// User-facing controller for "start-build" mint + status polling. Both
// routes carry a sessionId and are subject to ownership checks so a user
// can't mint a build token for someone else's session or peek at their
// build status.
@ApiTags('build-sessions')
@Controller('sessions')
export class StartBuildController {
  constructor(
    private readonly buildSessions: BuildSessionsService,
    private readonly ownership: OwnershipService,
  ) {}

  @Post(':id/start-build')
  @ApiOperation({
    summary: 'Mint a CLI bearer token for the build phase',
    description:
      "Marks build_started_at on the session, generates a one-time token of shape `<sessionId>.<secret>` (bcrypt hash stored on the row), and returns it to the web app. The candidate runs `mentor watch <token>` locally; the CLI presents the token on every flush. Calling this endpoint again rotates the token (old hash overwritten). Returns 400 if the path id is not a UUID, 404 if the session does not exist, 409 if the session is abandoned or the build phase already finished.",
  })
  async startBuild(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsSession(id, user.id);
    return this.buildSessions.startBuildPhase(id);
  }

  @Get(':id/build-events')
  @ApiOperation({
    summary: 'Build-phase status + per-file event aggregate',
    description:
      'Returns the build phase timestamps + total event count + a per-file aggregate summary. Used by the results page to poll for "waiting / in progress / complete" status and render the build-timeline widget.',
  })
  async buildEventsSummary(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsSession(id, user.id);
    return this.buildSessions.eventsSummary(id);
  }
}
