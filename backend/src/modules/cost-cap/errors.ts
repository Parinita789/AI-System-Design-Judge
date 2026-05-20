import { ForbiddenException } from '@nestjs/common';
import { nextUtcMidnight } from './pricing';

export class CostCapExceededError extends ForbiddenException {
  constructor(spentTodayUsd: number, capUsd: number) {
    const resetAt = nextUtcMidnight();
    super({
      statusCode: 403,
      error: 'Forbidden',
      code: 'COST_CAP_EXCEEDED',
      spentTodayUsd,
      capUsd,
      resetAtUtc: resetAt.toISOString(),
      message:
        `You've used $${spentTodayUsd.toFixed(2)} of your $${capUsd.toFixed(2)} daily LLM budget. ` +
        `Resets at ${resetAt.toISOString()}.`,
    });
  }
}
