import { Module } from '@nestjs/common';
import { CostCapService } from './services/cost-cap.service';
import { LlmSpendRepository } from './repositories/llm-spend.repository';
import { CostCapController } from './handlers/cost-cap.controller';

// Self-contained. CostCapService needs only PrismaService (global)
// and ConfigService (also global). Other modules import CostCapModule
// to inject CostCapService — wired into LlmService in commit 3.3.
@Module({
  controllers: [CostCapController],
  providers: [CostCapService, LlmSpendRepository],
  exports: [CostCapService],
})
export class CostCapModule {}
