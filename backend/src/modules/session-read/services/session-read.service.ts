import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SessionReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getWithQuestion(sessionId: string) {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { question: true },
    });
    if (!row) throw new NotFoundException(`Session ${sessionId} not found`);
    const { buildTokenHash: _buildTokenHash, ...rest } = row;
    return rest;
  }
}
