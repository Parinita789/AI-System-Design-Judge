import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CostCapService } from '../services/cost-cap.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/auth.types';
import { nextUtcMidnight } from '../pricing';

@ApiTags('cost-cap')
@Controller('cost-cap')
export class CostCapController {
  constructor(private readonly costCap: CostCapService) {}

  @Get('today')
  @ApiOperation({
    summary: "Current user's LLM spend since UTC midnight + cap + reset time",
    description:
      'Returns the amount the authenticated user has spent on LLM calls today, the configured daily cap, and the UTC timestamp when the daily window rolls over. Frontend renders this as a usage widget; does NOT itself spend any LLM budget.',
  })
  async today(@CurrentUser() user: AuthenticatedUser) {
    const spentTodayUsd = await this.costCap.getTodaySpendUsd(user.id);
    return {
      spentTodayUsd,
      capUsd: this.costCap.getDailyCapUsd(),
      resetAtUtc: nextUtcMidnight().toISOString(),
    };
  }
}
