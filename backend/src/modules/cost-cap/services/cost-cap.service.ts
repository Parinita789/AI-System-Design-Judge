import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmSpendRepository } from '../repositories/llm-spend.repository';
import { CostCapExceededError } from '../errors';
import { LlmProvider, estimateCostUsd, UsageTokens } from '../pricing';

// Default daily cap if LLM_DAILY_CAP_USD env is missing. Conservative
// — high enough that real usage rarely trips, low enough that an
// abusive user can't burn an unexpected sum. Override per deploy.
const DEFAULT_DAILY_CAP_USD = 5.0;

export interface RecordSpendParams {
  userId: string;
  provider: LlmProvider;
  model: string;
  tokens: UsageTokens;
  route: string;
}

@Injectable()
export class CostCapService {
  private readonly logger = new Logger(CostCapService.name);
  private readonly dailyCapUsd: number;

  constructor(
    private readonly llmSpend: LlmSpendRepository,
    config: ConfigService,
  ) {
    const raw = config.get<string>('LLM_DAILY_CAP_USD');
    const parsed = raw === undefined || raw === '' ? DEFAULT_DAILY_CAP_USD : Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(
        `LLM_DAILY_CAP_USD="${raw}" is not a non-negative number`,
      );
    }
    this.dailyCapUsd = parsed;
    this.logger.log(`Daily LLM cap configured: $${this.dailyCapUsd.toFixed(2)} per user`);
  }

  // Called BEFORE every LLM-billing call. Throws CostCapExceededError
  // (HTTP 403, code='COST_CAP_EXCEEDED') if the user has already hit
  // their cap. The TOCTOU window between this check and the next
  // record() means a user might overshoot by one call's worth of
  // spend in extreme concurrency — accepted as standard for $-caps.
  async assertWithinCap(userId: string): Promise<void> {
    const spent = await this.llmSpend.sumSinceTodayUtcMidnight(userId);
    if (spent >= this.dailyCapUsd) {
      this.logger.warn(
        `Cost cap denied user=${userId} spent=$${spent.toFixed(2)} cap=$${this.dailyCapUsd.toFixed(2)}`,
      );
      throw new CostCapExceededError(spent, this.dailyCapUsd);
    }
  }

  // Called AFTER a successful LLM call. Inserts a spend row with the
  // estimated USD cost. Errors propagate to the caller; the spend row
  // not being recorded means the cap check might pass when it
  // shouldn't on the next call. Acceptable failure mode — better to
  // miss one row than to silently swallow.
  async record(params: RecordSpendParams): Promise<void> {
    const estimatedCostUsd = estimateCostUsd(params.provider, params.model, params.tokens);
    await this.llmSpend.insert({
      userId: params.userId,
      provider: params.provider,
      model: params.model,
      tokensIn: params.tokens.tokensIn,
      tokensOut: params.tokens.tokensOut,
      cacheReadTokens: params.tokens.cacheReadTokens,
      cacheCreationTokens: params.tokens.cacheCreationTokens,
      estimatedCostUsd,
      route: params.route,
    });
  }

  // Read-only — frontend uses this to show "$X.XX of $Y.YY used".
  getTodaySpendUsd(userId: string): Promise<number> {
    return this.llmSpend.sumSinceTodayUtcMidnight(userId);
  }

  // Exposed for the frontend usage widget and for tests.
  getDailyCapUsd(): number {
    return this.dailyCapUsd;
  }
}
