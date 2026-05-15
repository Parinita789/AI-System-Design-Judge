import { Module } from '@nestjs/common';
import { SessionReadService } from './services/session-read.service';

@Module({
  providers: [SessionReadService],
  exports: [SessionReadService],
})
export class SessionReadModule {}
