import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(_data: { prompt: string; projectPath: string; rubricVersion: string }) {
    throw new Error('Not implemented');
  }

  findById(_id: string) {
    throw new Error('Not implemented');
  }

  findAll() {
    throw new Error('Not implemented');
  }

  markEnded(_id: string) {
    throw new Error('Not implemented');
  }

  updateOverall(_id: string, _score: number, _feedback: string) {
    throw new Error('Not implemented');
  }
}
