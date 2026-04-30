import { Module, forwardRef } from '@nestjs/common';
import { SessionsController } from './handlers/sessions.controller';
import { SessionsService } from './services/sessions.service';
import { SessionsRepository } from './repositories/sessions.repository';
import { EvaluationsModule } from '../evaluations/evaluations.module';

@Module({
  imports: [forwardRef(() => EvaluationsModule)],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsRepository],
  exports: [SessionsService, SessionsRepository],
})
export class SessionsModule {}
