import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventBuffer } from './buffer';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mentor-buffer-'));
}

describe('EventBuffer', () => {
  it('appends + lists unsent', () => {
    const dir = tmpDir();
    const buf = new EventBuffer({ dir });
    buf.append({ filePath: 'a.ts', action: 'created', content: 'x' });
    buf.append({ filePath: 'b.ts', action: 'modified', contentDiff: '+y' });
    expect(buf.size()).toEqual({ total: 2, unsent: 2 });
    const u = buf.unsent();
    expect(u.map((e) => e.filePath)).toEqual(['a.ts', 'b.ts']);
    expect(u[0].id).toBe(1);
    expect(u[1].id).toBe(2);
  });

  it('markSent makes events disappear from unsent()', () => {
    const dir = tmpDir();
    const buf = new EventBuffer({ dir });
    const a = buf.append({ filePath: 'a.ts', action: 'created' });
    const b = buf.append({ filePath: 'b.ts', action: 'modified' });
    buf.markSent([a.id]);
    const u = buf.unsent();
    expect(u.map((e) => e.id)).toEqual([b.id]);
    expect(buf.size()).toEqual({ total: 2, unsent: 1 });
  });

  it('persists across re-open: appended rows + sent flags survive', () => {
    const dir = tmpDir();
    const buf1 = new EventBuffer({ dir });
    const e1 = buf1.append({ filePath: 'a.ts', action: 'created' });
    buf1.append({ filePath: 'b.ts', action: 'modified' });
    buf1.markSent([e1.id]);

    const buf2 = new EventBuffer({ dir });
    expect(buf2.size()).toEqual({ total: 2, unsent: 1 });
    expect(buf2.unsent().map((e) => e.filePath)).toEqual(['b.ts']);
  });

  it('unsent respects the limit argument', () => {
    const dir = tmpDir();
    const buf = new EventBuffer({ dir });
    for (let i = 0; i < 10; i++) {
      buf.append({ filePath: `f${i}.ts`, action: 'created' });
    }
    expect(buf.unsent(3).length).toBe(3);
    expect(buf.unsent(100).length).toBe(10);
  });

  it('survives a truncated last line in the JSONL file', () => {
    const dir = tmpDir();
    const buf1 = new EventBuffer({ dir });
    buf1.append({ filePath: 'a.ts', action: 'created' });
    fs.appendFileSync(buf1.filePath(), '{"id":2,"filePath":"b.ts"', 'utf-8');

    const buf2 = new EventBuffer({ dir });
    expect(buf2.size().total).toBe(1);
  });
});
