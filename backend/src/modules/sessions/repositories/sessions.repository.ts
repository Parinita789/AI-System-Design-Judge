import { Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { questionId: string }) {
    return this.prisma.session.create({ data });
  }

  findById(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  // Most callers (orchestrator, hints) need the parent Question's prompt
  // and rubricVersion; this single round-trip fetches both.
  findByIdWithQuestion(id: string) {
    return this.prisma.session.findUnique({
      where: { id },
      include: { question: true },
    });
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
