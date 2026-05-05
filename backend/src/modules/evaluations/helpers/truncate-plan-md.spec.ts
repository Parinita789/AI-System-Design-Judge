import { DEFAULT_PLAN_MD_CAP, truncatePlanMd } from './truncate-plan-md';

describe('truncatePlanMd', () => {
  it('returns empty result for null input', () => {
    expect(truncatePlanMd(null)).toEqual({
      text: '',
      originalLength: 0,
      droppedChars: 0,
    });
  });

  it('returns input unchanged when under the cap', () => {
    const planMd = '# Scope\n\nA short plan.';
    const out = truncatePlanMd(planMd, 1000);
    expect(out.text).toBe(planMd);
    expect(out.droppedChars).toBe(0);
    expect(out.originalLength).toBe(planMd.length);
  });

  it('returns input unchanged when exactly at the cap', () => {
    const planMd = 'a'.repeat(1000);
    const out = truncatePlanMd(planMd, 1000);
    expect(out.droppedChars).toBe(0);
    expect(out.text.length).toBe(1000);
  });

  it('truncates with a head/tail split and omission marker when over the cap', () => {
    const planMd = 'a'.repeat(2000);
    const out = truncatePlanMd(planMd, 1000);
    expect(out.droppedChars).toBe(1000);
    expect(out.originalLength).toBe(2000);
    expect(out.text.length).toBeLessThanOrEqual(1000);
    expect(out.text).toMatch(/\[… 1,000 chars omitted …\]/);
    // Head + tail both present — cap is 1000, marker is ~30 chars,
    // so head + tail occupy ~970 of 'a's split 60/40 ish.
    expect(out.text.startsWith('aaaaaa')).toBe(true);
    expect(out.text.endsWith('aaaaaa')).toBe(true);
  });

  it('preserves the start of the plan more than the end (60/40 split)', () => {
    // Tag the start with a unique marker so we can verify it survives.
    const start = 'START_MARKER\n';
    const middle = 'x'.repeat(50_000);
    const end = '\nEND_MARKER';
    const planMd = start + middle + end;
    const out = truncatePlanMd(planMd, 5000);
    expect(out.text).toContain('START_MARKER');
    expect(out.text).toContain('END_MARKER');
    // Head should be longer than tail.
    const omissionIdx = out.text.indexOf('[…');
    const tailStart = out.text.indexOf('…]') + 2;
    expect(omissionIdx).toBeGreaterThan(out.text.length - tailStart);
  });

  it('uses 50,000 as the default cap', () => {
    const planMd = 'a'.repeat(60_000);
    const out = truncatePlanMd(planMd);
    expect(out.text.length).toBeLessThanOrEqual(DEFAULT_PLAN_MD_CAP);
    expect(out.droppedChars).toBe(60_000 - DEFAULT_PLAN_MD_CAP);
  });
});
