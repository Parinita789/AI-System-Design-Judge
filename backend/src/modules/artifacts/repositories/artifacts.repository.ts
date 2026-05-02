import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { FinalArtifacts } from '../types/artifacts.types';

@Injectable()
export class ArtifactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertFinal(_sessionId: string, _data: FinalArtifacts) {
    throw new Error('Not implemented');
  }

  findFinal(_sessionId: string) {
    throw new Error('Not implemented');
  }
}
