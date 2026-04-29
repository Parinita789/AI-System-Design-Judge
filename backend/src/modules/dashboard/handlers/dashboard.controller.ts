import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('trend')
  trend(@Query('rubricVersion') rubricVersion?: string) {
    return this.dashboardService.scoreTrend(rubricVersion);
  }

  @Get('heatmap')
  heatmap(@Query('rubricVersion') rubricVersion?: string) {
    return this.dashboardService.signalHeatmap(rubricVersion);
  }

  @Get('weaknesses')
  weaknesses(@Query('rubricVersion') rubricVersion?: string) {
    return this.dashboardService.recurringWeaknesses(rubricVersion);
  }
}
