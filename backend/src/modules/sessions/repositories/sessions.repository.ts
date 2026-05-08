import { Injectable } from '@nestjs/common';
import { Seniority as PrismaSeniority, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

// Excludes buildTokenHash so it never reaches API responses. The
// hash is consumed only inside BuildTokenService.verify, which uses
// Prisma directly rather than going through this repository.
function stripHash<T extends { buildTokenHash?: string | null } | null>(
  row: T,
): T extends null ? null : Omit<NonNullable<T>, 'buildTokenHash'> {
  if (!row) return row as never;
  const { buildTokenHash: _hash, ...rest } = row;
  return rest as never;
}

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { questionId: string; seniority?: PrismaSeniority | null }) {
    return this.prisma.session.create({
      data: {
        questionId: data.questionId,
        seniority: data.seniority ?? null,
      },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return stripHash(row);
  }

  async findByIdWithQuestion(id: string) {
    const row = await this.prisma.session.findUnique({
      where: { id },
      include: { question: true },
    });
    return stripHash(row);
  }

  async findAll() {
    const rows = await this.prisma.session.findMany({ orderBy: { startedAt: 'desc' } });
    return rows.map((r) => stripHash(r));
  }

  async markEnded(id: string, status: SessionStatus) {
    const row = await this.prisma.session.update({
      where: { id },
      data: { status, endedAt: new Date() },
    });
    return stripHash(row);
  }

  updateOverall(_id: string, _score: number, _feedback: string) {
    throw new Error('Not implemented');
  }

  // Hard delete. Every child table FK has onDelete: Cascade
  // (snapshots, hints, build_events, build_ai_interactions,
  // phase_evaluations -> evaluation_audits + mentor_artifacts +
  // signal_mentor_artifacts), so a single row deletion cascades
  // through the whole dependency tree atomically.
  deleteById(id: string) {
    return this.prisma.session.delete({ where: { id } });
  }
}
