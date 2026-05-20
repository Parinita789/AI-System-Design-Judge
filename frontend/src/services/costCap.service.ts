import { api } from './api';

export interface DailySpend {
  spentTodayUsd: number;
  capUsd: number;
  resetAtUtc: string;
}

export const costCapService = {
  today: async (): Promise<DailySpend> => {
    const res = await api.get<DailySpend>('/cost-cap/today');
    return res.data;
  },
};
