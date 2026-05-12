import * as fs from 'node:fs';
import * as path from 'node:path';

export function writeJsonSidecar(absPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

export function safeFilename(id: string): string {
  // pkg/module-id -> pkg__module-id; preserve forward-compat for ids
  // that already use __.
  return id.replace(/[/\\]/g, '__').replace(/[^a-zA-Z0-9_\-.]+/g, '_');
}
