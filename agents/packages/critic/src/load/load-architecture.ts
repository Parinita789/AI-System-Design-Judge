import * as fs from 'node:fs';
import * as path from 'node:path';

// Reads agents/data/architecture/architecture.md + agents/data/schema/
// schema.md. Both are Mermaid source files; we pass them verbatim into
// the synthesis prompt as system-level global context.
export interface GlobalContextSources {
  architectureMd: string | null;
  schemaMd: string | null;
}

export function loadArchitectureSources(repoRoot: string): GlobalContextSources {
  return {
    architectureMd: readOptional(
      path.join(repoRoot, 'agents', 'data', 'architecture', 'architecture.md'),
    ),
    schemaMd: readOptional(path.join(repoRoot, 'agents', 'data', 'schema', 'schema.md')),
  };
}

function readOptional(p: string): string | null {
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}
