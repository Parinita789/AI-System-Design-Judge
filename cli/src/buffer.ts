import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type EventAction = 'created' | 'modified' | 'deleted';

export interface BufferedEvent {
  id: number;
  filePath: string;
  action: EventAction;
  content: string | null;
  contentDiff: string | null;
  occurredAt: string;
  sent: boolean;
}

export interface NewEvent {
  filePath: string;
  action: EventAction;
  content?: string | null;
  contentDiff?: string | null;
  occurredAt?: string;
}

const DEFAULT_DIR = path.join(os.homedir(), '.mentor');

// Append-only JSONL log + in-memory unsent queue. The file is the
// durable record; the queue tracks which rows still need shipping.
// Re-opening the buffer after a crash reads every line back and
// re-marks anything not in the persisted "sent cursor" as unsent.
export class EventBuffer {
  private file: string;
  private cursorFile: string;
  private nextId = 1;
  private events: BufferedEvent[] = [];

  constructor(opts: { dir?: string; file?: string } = {}) {
    const dir = opts.dir ?? DEFAULT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    this.file = opts.file ?? path.join(dir, 'buffer.jsonl');
    this.cursorFile = path.join(path.dirname(this.file), 'sent-cursor.json');
    this.load();
  }

  private load(): void {
    let sentIds = new Set<number>();
    if (fs.existsSync(this.cursorFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.cursorFile, 'utf-8'));
        if (Array.isArray(raw?.sentIds)) sentIds = new Set(raw.sentIds);
      } catch {
        sentIds = new Set();
      }
    }

    if (!fs.existsSync(this.file)) return;
    const lines = fs.readFileSync(this.file, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as BufferedEvent;
        row.sent = sentIds.has(row.id);
        this.events.push(row);
        if (row.id >= this.nextId) this.nextId = row.id + 1;
      } catch {
        // Truncated line at the tail — ignore; the next append continues.
      }
    }
  }

  append(e: NewEvent): BufferedEvent {
    const row: BufferedEvent = {
      id: this.nextId++,
      filePath: e.filePath,
      action: e.action,
      content: e.content ?? null,
      contentDiff: e.contentDiff ?? null,
      occurredAt: e.occurredAt ?? new Date().toISOString(),
      sent: false,
    };
    fs.appendFileSync(this.file, JSON.stringify(row) + '\n', 'utf-8');
    this.events.push(row);
    return row;
  }

  unsent(limit = 100): BufferedEvent[] {
    const out: BufferedEvent[] = [];
    for (const e of this.events) {
      if (!e.sent) out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  markSent(ids: number[]): void {
    const idSet = new Set(ids);
    for (const e of this.events) {
      if (idSet.has(e.id)) e.sent = true;
    }
    this.persistCursor();
  }

  size(): { total: number; unsent: number } {
    const total = this.events.length;
    const unsent = this.events.filter((e) => !e.sent).length;
    return { total, unsent };
  }

  filePath(): string {
    return this.file;
  }

  private persistCursor(): void {
    const sentIds = this.events.filter((e) => e.sent).map((e) => e.id);
    fs.writeFileSync(this.cursorFile, JSON.stringify({ sentIds }), 'utf-8');
  }
}
