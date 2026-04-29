import { Injectable } from '@nestjs/common';
import { DashboardRepository } from '../repositories/dashboard.repository';
import { HeatmapCell, TrendPoint, WeaknessSummary } from '../models/dashboard.types';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  scoreTrend(_rubricVersion?: string): Promise<TrendPoint[]> {
    throw new Error('Not implemented');
  }

  signalHeatmap(_rubricVersion?: string): Promise<HeatmapCell[]> {
    throw new Error('Not implemented');
  }

  recurringWeaknesses(_rubricVersion?: string): Promise<WeaknessSummary[]> {
    throw new Error('Not implemented');
  }
}
