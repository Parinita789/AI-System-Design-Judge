import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { walkImports, resetWalker } from './walk-imports';

function tmpFile(content: string, ext = '.ts'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-'));
  const p = path.join(dir, `f${ext}`);
  fs.writeFileSync(p, content);
  return p;
}

beforeEach(() => resetWalker());

describe('walkImports', () => {
  it('extracts import specifiers from static import declarations', () => {
    const file = tmpFile(
      `import { A } from './a';\nimport B from '../b';\nimport 'side-effect';\n`,
    );
    const result = walkImports(file);
    expect(result.imports.sort()).toEqual(['../b', './a', 'side-effect']);
  });

  it('extracts re-export specifiers (export { X } from "...")', () => {
    const file = tmpFile(
      `export { foo } from './foo';\nexport * from './bar';\n`,
    );
    const result = walkImports(file);
    expect(result.imports.sort()).toEqual(['./bar', './foo']);
  });

  it('extracts dynamic import("...") arguments', () => {
    const file = tmpFile(
      `async function load() {\n  const m = await import('./dynamic');\n  return m;\n}\n`,
    );
    const result = walkImports(file);
    expect(result.imports).toContain('./dynamic');
  });

  it('dedupes repeated specifiers', () => {
    const file = tmpFile(
      `import { A } from './x';\nimport { B } from './x';\nexport { C } from './x';\n`,
    );
    const result = walkImports(file);
    expect(result.imports.filter((i) => i === './x').length).toBe(1);
  });

  it('returns top-level exported names: classes, functions, consts, interfaces, types, enums', () => {
    const file = tmpFile(
      `export class Foo {}\nexport function bar() {}\nexport const baz = 1;\nexport interface Iface {}\nexport type T = number;\nexport enum E { A }\nclass NotExported {}\n`,
    );
    const result = walkImports(file);
    expect(result.exports.sort()).toEqual(['E', 'Foo', 'Iface', 'T', 'bar', 'baz']);
  });

  it('returns no exports for a file with no top-level declarations', () => {
    const file = tmpFile(`import { x } from './x';\nx();\n`);
    const result = walkImports(file);
    expect(result.exports).toEqual([]);
  });
});
