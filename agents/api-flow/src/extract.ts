#!/usr/bin/env node
/**
 * API call-flow extractor.
 *
 * Walks backend/src/modules/<...>/*.controller.ts (recursive) via
 * the backend's tsconfig (so type references resolve), finds every
 * `@Controller`-decorated class, then every `@Get / @Post / @Put /
 * @Delete / @Patch`-decorated method inside, and emits the call
 * tree rooted at each handler.
 *
 * Output: agents/codebase-map/backend-api-flow.json
 *
 * Usage:
 *   cd agents/api-flow && npm run extract -- [--repo-root <path>]
 */
import { Project, ClassDeclaration, SyntaxKind, Node, Decorator } from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { traceMethod, TraceContext } from './trace';
import { annotateEndpointsWithCli } from './cli-callers';
import { ApiFlowOutput, CallNode, Endpoint } from './types';

const HTTP_DECORATORS = new Set(['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head']);

interface ExtractOptions {
  repoRoot: string;
}

function resolveRepoRoot(): string {
  // Walk up from cwd until we find the repo root (backend/ + frontend/
  // + cli/ + agents/ all present). Lets the script work from any
  // working dir.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'backend')) &&
      fs.existsSync(path.join(dir, 'agents'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Could not locate repo root (expected backend/ + agents/ siblings).',
  );
}

function parseArgs(): ExtractOptions {
  const args = process.argv.slice(2);
  let repoRoot: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo-root') {
      repoRoot = path.resolve(args[++i]);
    }
  }
  return { repoRoot: repoRoot ?? resolveRepoRoot() };
}

// Pull the string argument from `@Get('foo/bar')` or fall back to
// '' for `@Get()`.
function decoratorPath(d: Decorator): string {
  const callExpr = d.getCallExpression();
  if (!callExpr) return '';
  const args = callExpr.getArguments();
  const first = args[0];
  if (!first) return '';
  if (Node.isStringLiteral(first)) return first.getLiteralValue();
  // Template literals etc. — return the raw text minus quotes.
  return first.getText().replace(/^['"`]|['"`]$/g, '');
}

function joinRoute(prefix: string, sub: string): string {
  const p = prefix.replace(/^\/|\/$/g, '');
  const s = sub.replace(/^\/|\/$/g, '');
  if (!p && !s) return '/';
  if (!p) return '/' + s;
  if (!s) return '/' + p;
  return '/' + p + '/' + s;
}

function endpointId(verb: string, route: string): string {
  // URL-hash-friendly id. Keeps colons and slashes legible enough
  // to spot the route in the hash.
  return verb + ' ' + route;
}

// Walk a backend module dir up from controllerFile to discover the
// containing module's id (the dir name under backend/src/modules/,
// or backend/src/<infra> for common/config/database).
function inferModule(controllerFile: string, repoRoot: string): string {
  const rel = path.relative(repoRoot, controllerFile);
  // typical: backend/src/modules/<module>/handlers/foo.controller.ts
  const m = rel.match(/^backend\/src\/modules\/([^/]+)\//);
  if (m) return m[1];
  const inf = rel.match(/^backend\/src\/([^/]+)\//);
  if (inf) return inf[1];
  return '_root';
}

function countNodes(n: CallNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

function maxDepth(n: CallNode, d = 0): number {
  if (n.children.length === 0) return d;
  return Math.max(...n.children.map((c) => maxDepth(c, d + 1)));
}

function countByType(n: CallNode, type: CallNode['type']): number {
  return (
    (n.type === type ? 1 : 0) + n.children.reduce((s, c) => s + countByType(c, type), 0)
  );
}

function main(): void {
  const { repoRoot } = parseArgs();
  const tsConfigPath = path.join(repoRoot, 'backend', 'tsconfig.json');
  if (!fs.existsSync(tsConfigPath)) {
    throw new Error(`No tsconfig at ${tsConfigPath}`);
  }
  console.log(`Loading backend project from ${tsConfigPath} ...`);
  const project = new Project({ tsConfigFilePath: tsConfigPath });
  console.log(`Loaded ${project.getSourceFiles().length} source files.`);

  const endpoints: Endpoint[] = [];
  const ctx: TraceContext = { project, repoRoot };

  for (const sf of project.getSourceFiles()) {
    if (!sf.getFilePath().endsWith('.controller.ts')) continue;
    if (sf.getFilePath().includes('node_modules')) continue;

    for (const cls of sf.getClasses()) {
      const controllerDeco = cls.getDecorator('Controller');
      if (!controllerDeco) continue;

      const prefix = decoratorPath(controllerDeco);
      const controllerName = cls.getName() ?? '<anonymous>';
      const file = path.relative(repoRoot, sf.getFilePath());
      const moduleName = inferModule(sf.getFilePath(), repoRoot);

      for (const method of cls.getMethods()) {
        const httpDecoName = method
          .getDecorators()
          .map((d) => d.getName())
          .find((n) => HTTP_DECORATORS.has(n));
        if (!httpDecoName) continue;

        const verb = httpDecoName.toUpperCase();
        const subPath = decoratorPath(method.getDecorator(httpDecoName)!);
        const route = joinRoute(prefix, subPath);
        const id = endpointId(verb, route);

        console.log(`  ${id}  (${controllerName}.${method.getName()})`);

        const visited = new Set<string>();
        const callTree = traceMethod(ctx, cls, method, visited, 0);

        endpoints.push({
          id,
          module: moduleName,
          controller: controllerName,
          controllerFile: file,
          method: method.getName(),
          httpVerb: verb,
          route: id,
          callTree,
          cliCallers: [],
          stats: {
            nodeCount: countNodes(callTree),
            maxDepth: maxDepth(callTree),
            unresolvedCount: countByType(callTree, 'unresolved'),
            cycleCount: countByType(callTree, 'cycle'),
          },
        });
      }
    }
  }

  // Stable sort: by module then route.
  endpoints.sort(
    (a, b) =>
      a.module.localeCompare(b.module) || a.route.localeCompare(b.route),
  );

  // Second pass: scan cli/ for HTTP callsites and annotate endpoints
  // with their CLI callers. Free — no backend re-parse, just a
  // separate lightweight ts-morph project over cli/src/*.ts.
  console.log('\nScanning cli/ for HTTP callers...');
  annotateEndpointsWithCli(endpoints, repoRoot);
  const cliHits = endpoints.filter((e) => e.cliCallers.length > 0);
  console.log(
    `  ${cliHits.length} endpoint(s) have CLI callers: ${cliHits
      .map((e) => e.route)
      .join(', ')}`,
  );

  const out: ApiFlowOutput = {
    package: 'backend',
    generatedAt: new Date().toISOString(),
    endpoints,
  };
  const outDir = path.join(repoRoot, 'agents', 'codebase-map');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'backend-api-flow.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outPath} (${endpoints.length} endpoints)`);
}

main();
