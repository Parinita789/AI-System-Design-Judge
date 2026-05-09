import { Project, SyntaxKind, Node, SourceFile } from 'ts-morph';
import { FileImports } from '../types';

// Lazy-singleton Project. We use ts-morph for syntactic walks only —
// no type-checking, no symbol resolution — so we disable everything
// that would force a full TS program build. Files are added on
// demand (`addSourceFileAtPath`) so each call is O(file size), not
// O(repo size).
//
// Why one shared Project: ts-morph dedupes paths internally; reusing
// the project across calls means we don't re-tokenise a file if two
// modules happen to look at it.
let sharedProject: Project | null = null;

function getProject(): Project {
  if (sharedProject) return sharedProject;
  sharedProject = new Project({
    compilerOptions: {
      noResolve: true,
      skipLibCheck: true,
      noEmit: true,
      allowJs: false,
      // Keep TSX parsing on for the frontend.
      jsx: 4 /* Preserve */,
    },
    useInMemoryFileSystem: false,
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });
  return sharedProject;
}

export function walkImports(absPath: string): FileImports {
  const project = getProject();
  let sf = project.getSourceFile(absPath);
  if (!sf) {
    sf = project.addSourceFileAtPath(absPath);
  }
  return {
    imports: extractImports(sf),
    exports: extractExports(sf),
  };
}

// Reset the shared project — useful for tests that want a clean
// state between cases.
export function resetWalker(): void {
  sharedProject = null;
}

function extractImports(sf: SourceFile): string[] {
  const out: string[] = [];

  // `import x from 'y'` / `import { a } from 'y'` / `import 'y'`.
  for (const decl of sf.getImportDeclarations()) {
    out.push(decl.getModuleSpecifierValue());
  }
  // `export { x } from 'y'` (re-exports count as imports for graph).
  for (const decl of sf.getExportDeclarations()) {
    const spec = decl.getModuleSpecifierValue();
    if (spec) out.push(spec);
  }
  // Dynamic `import('...')` — best-effort: walk for CallExpression
  // nodes whose expression is the import keyword.
  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;
    const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression);
    if (callExpr.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      const arg = callExpr.getArguments()[0];
      if (arg && arg.getKind() === SyntaxKind.StringLiteral) {
        out.push(arg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue());
      }
    }
  });

  // Dedupe; preserve order.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const i of out) {
    if (!seen.has(i)) {
      seen.add(i);
      deduped.push(i);
    }
  }
  return deduped;
}

function extractExports(sf: SourceFile): string[] {
  const out: string[] = [];

  // Named exports: `export class Foo {}`, `export function bar() {}`,
  // `export const Baz = ...`, `export interface I {}`,
  // `export type T = ...`, `export enum E {}`.
  for (const c of sf.getClasses()) {
    if (c.isExported()) out.push(c.getName() ?? '<anonymous class>');
  }
  for (const f of sf.getFunctions()) {
    if (f.isExported()) out.push(f.getName() ?? '<anonymous function>');
  }
  for (const v of sf.getVariableStatements()) {
    if (!v.isExported()) continue;
    for (const d of v.getDeclarations()) {
      out.push(d.getName());
    }
  }
  for (const i of sf.getInterfaces()) {
    if (i.isExported()) out.push(i.getName());
  }
  for (const t of sf.getTypeAliases()) {
    if (t.isExported()) out.push(t.getName());
  }
  for (const e of sf.getEnums()) {
    if (e.isExported()) out.push(e.getName());
  }

  // `export default class Foo`, `export default function bar`,
  // `export default ...` — pull a name when we can.
  const def = sf.getDefaultExportSymbol();
  if (def) {
    const decl = def.getDeclarations()[0];
    if (decl) {
      const name = (decl as Node & { getName?: () => string | undefined }).getName?.();
      out.push(name ? `default(${name})` : 'default');
    }
  }

  // Re-export aggregator forms: `export * from '...'` and
  // `export { Foo } from '...'`. Skipped — these inflate the
  // export list with names that aren't really declared in this
  // file. The graph already captures the dependency.

  return out;
}
