import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { prompt: string; rubricVersion: string }) {
    return this.prisma.session.create({ data });
  }

  findById(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  findAll() {
    return this.prisma.session.findMany({ orderBy: { startedAt: 'desc' } });
  }

  markEnded(id: string, status: SessionStatus) {
    return this.prisma.session.update({
      where: { id },
      data: { status, endedAt: new Date() },
    });
  }

  updateOverall(_id: string, _score: number, _feedback: string) {
    throw new Error('Not implemented');
  }
}
