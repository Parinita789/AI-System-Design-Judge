import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  selectScoreTrend(_rubricVersion?: string) {
    throw new Error('Not implemented');
  }

  selectSignalHeatmap(_rubricVersion?: string) {
    throw new Error('Not implemented');
  }

  selectRecurringWeaknesses(_rubricVersion?: string) {
    throw new Error('Not implemented');
  }
}
