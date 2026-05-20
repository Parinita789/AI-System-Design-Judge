import { Injectable } from '@nestjs/common';
import { LlmSpend, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { todayUtcMidnight } from '../pricing';

export interface InsertSpendParams {
  userId: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  route: string;
}

@Injectable()
export class LlmSpendRepository {
  constructor(private readonly prisma: PrismaService) {}

  insert(data: InsertSpendParams): Promise<LlmSpend> {
    return this.prisma.llmSpend.create({
      data: {
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        cacheReadTokens: data.cacheReadTokens,
        cacheCreationTokens: data.cacheCreationTokens,
        // Decimal stored as a positional string; Prisma accepts a
        // Decimal | number | string here. We use number for the
        // caller's ergonomics; precision is sufficient for daily caps
        // measured in dollars.
        estimatedCostUsd: new Prisma.Decimal(data.estimatedCostUsd),
        route: data.route,
      },
    });
  }

  // Hot-path query: "what has this user spent since UTC midnight?"
  // The compound index on (user_id, occurred_at) makes this a single
  // range scan. Decimal sum → JS number with float precision; the
  // imprecision is many orders of magnitude below the daily cap
  // granularity.
  async sumSinceTodayUtcMidnight(userId: string): Promise<number> {
    const sinceMidnight = todayUtcMidnight();
    const result = await this.prisma.llmSpend.aggregate({
      where: { userId, occurredAt: { gte: sinceMidnight } },
      _sum: { estimatedCostUsd: true },
    });
    return Number(result._sum.estimatedCostUsd ?? 0);
  }
}
