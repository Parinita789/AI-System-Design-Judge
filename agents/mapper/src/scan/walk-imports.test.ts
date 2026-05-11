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

  it('captures `export default class Foo {}` with the class name', () => {
    const file = tmpFile(`export default class Foo {}\n`);
    const result = walkImports(file);
    // ts-morph reports the class itself via getClasses() with
    // isExported() true, so Foo appears in the export list. The
    // default symbol path is a belt-and-braces fallback.
    expect(result.exports).toEqual(expect.arrayContaining(['Foo']));
  });

  it('captures `export default function bar() {}` with the function name', () => {
    const file = tmpFile(`export default function bar() {}\n`);
    const result = walkImports(file);
    expect(result.exports).toEqual(expect.arrayContaining(['bar']));
  });

  it('records a placeholder for an anonymous default export', () => {
    const file = tmpFile(`const x = 1;\nexport default x;\n`);
    const result = walkImports(file);
    // Either the const "x" is reported (variable statement is
    // exported via the default re-bind), or a "default" placeholder
    // surfaces via getDefaultExportSymbol — both are valid; we
    // require at least one of them so the file isn't reported as
    // having zero exports.
    expect(result.exports.length).toBeGreaterThan(0);
  });
});
