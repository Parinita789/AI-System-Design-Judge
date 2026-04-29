import { Module } from '@nestjs/common';
import { DashboardController } from './handlers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { DashboardRepository } from './repositories/dashboard.repository';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
  exports: [DashboardService],
})
export class DashboardModule {}
