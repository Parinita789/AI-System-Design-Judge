import { Injectable } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository';
import { EvaluationsService } from '../../evaluations/services/evaluations.service';
import { CreateSessionDto } from '../models/create-session.dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  start(_dto: CreateSessionDto) {
    throw new Error('Not implemented');
  }

  end(_sessionId: string) {
    throw new Error('Not implemented');
  }

  get(_sessionId: string) {
    throw new Error('Not implemented');
  }

  list() {
    throw new Error('Not implemented');
  }
}
