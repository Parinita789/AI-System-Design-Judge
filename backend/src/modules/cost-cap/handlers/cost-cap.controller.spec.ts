import { CostCapController } from './cost-cap.controller';
import type { CostCapService } from '../services/cost-cap.service';
import type { AuthenticatedUser } from '../../auth/types/auth.types';

function makeUser(id = 'uid-1'): AuthenticatedUser {
  return { id, email: `${id}@test.local` } as AuthenticatedUser;
}

function makeService(opts: { spend?: number; cap?: number } = {}) {
  const svc = {
    getTodaySpendUsd: jest.fn().mockResolvedValue(opts.spend ?? 0),
    getDailyCapUsd: jest.fn().mockReturnValue(opts.cap ?? 5.0),
  } as unknown as CostCapService;
  return new CostCapController(svc);
}

describe('CostCapController.today', () => {
  it('returns spend + cap + ISO reset for the current user', async () => {
    const ctrl = makeService({ spend: 1.23, cap: 5 });
    const body = await ctrl.today(makeUser('uid-42'));
    expect(body.spentTodayUsd).toBe(1.23);
    expect(body.capUsd).toBe(5);
    expect(body.resetAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it('queries the spend for the @CurrentUser principal, not a global', async () => {
    const svc = {
      getTodaySpendUsd: jest.fn().mockResolvedValue(0),
      getDailyCapUsd: jest.fn().mockReturnValue(5),
    } as unknown as CostCapService;
    const ctrl = new CostCapController(svc);
    await ctrl.today(makeUser('uid-A'));
    await ctrl.today(makeUser('uid-B'));
    expect(svc.getTodaySpendUsd).toHaveBeenNthCalledWith(1, 'uid-A');
    expect(svc.getTodaySpendUsd).toHaveBeenNthCalledWith(2, 'uid-B');
  });

  it('reset is strictly in the future', async () => {
    const ctrl = makeService();
    const body = await ctrl.today(makeUser());
    expect(Date.parse(body.resetAtUtc)).toBeGreaterThan(Date.now());
  });
});
