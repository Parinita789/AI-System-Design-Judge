import { dedupePlanMd } from './dedupe-plan-md';

describe('dedupePlanMd', () => {
  it('returns empty result for null input', () => {
    const out = dedupePlanMd(null);
    expect(out).toEqual({ text: '', removedParagraphs: 0, removedChars: 0 });
  });

  it('passes through unique paragraphs unchanged', () => {
    const input = `# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\n## Section\n\nThird.`;
    const out = dedupePlanMd(input);
    expect(out.text).toBe(input);
    expect(out.removedParagraphs).toBe(0);
  });

  it('drops a verbatim duplicate paragraph and counts it', () => {
    const para = 'The data model commits to one Url(id, slug, target) row per shortlink.';
    const input = `${para}\n\nSomething else.\n\n${para}`;
    const out = dedupePlanMd(input);
    expect(out.text).toBe(`${para}\n\nSomething else.`);
    expect(out.removedParagraphs).toBe(1);
    expect(out.removedChars).toBeGreaterThan(0);
  });

  it('treats whitespace-only differences as duplicates', () => {
    const input = `Build sequence: skeleton → POST /shorten → cache.\n\nBuild sequence:    Skeleton → POST /shorten → cache.`;
    const out = dedupePlanMd(input);
    expect(out.removedParagraphs).toBe(1);
  });

  it('treats casing differences as duplicates', () => {
    const input = `Read path uses Redis cache.\n\nREAD PATH uses Redis cache.`;
    const out = dedupePlanMd(input);
    expect(out.removedParagraphs).toBe(1);
  });

  it('preserves repeated horizontal rules (--- / *** / ___)', () => {
    const input = `Section A\n\n---\n\nSection B\n\n---\n\nSection C`;
    const out = dedupePlanMd(input);
    expect(out.text).toBe(input);
    expect(out.removedParagraphs).toBe(0);
  });

  it('keeps the first occurrence and drops later ones (order preserved)', () => {
    const a = 'Alpha paragraph with content.';
    const b = 'Beta paragraph with content.';
    const input = `${a}\n\n${b}\n\n${a}\n\n${b}\n\n${a}`;
    const out = dedupePlanMd(input);
    expect(out.text).toBe(`${a}\n\n${b}`);
    expect(out.removedParagraphs).toBe(3);
  });

  it('does not collapse non-duplicate adjacent short headings', () => {
    const input = `## Scope\n\nFirst section.\n\n## Approach\n\nSecond section.`;
    const out = dedupePlanMd(input);
    expect(out.removedParagraphs).toBe(0);
  });

  it('handles empty string', () => {
    expect(dedupePlanMd('')).toEqual({ text: '', removedParagraphs: 0, removedChars: 0 });
  });
});
