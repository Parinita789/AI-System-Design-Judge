import {
  Project,
  Node,
  SyntaxKind,
  CallExpression,
  PropertyAccessExpression,
  ParameterDeclaration,
  Identifier,
  VariableDeclaration,
  NewExpression,
} from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CliCaller, CliFuncRef } from './types';

const HTTP_VERBS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);
const API_PREFIX = '/api';

// Hard-coded list of "command entry" function names. These are the
// exported run* functions invoked by commander in cli/src/index.ts.
// Adding a new command requires extending this set; it's tiny by
// design (3 entries for `watch`, `finish`, `status`).
const COMMAND_ENTRIES = new Set(['runWatch', 'runFinish', 'runStatus']);

// Map command-entry function name → user-facing subcommand.
const COMMAND_LABEL: Record<string, string> = {
  runWatch: 'mentor watch',
  runFinish: 'mentor finish',
  runStatus: 'mentor status',
};

interface ResolvedFunc {
  id: string;
  ref: CliFuncRef;
  isMethod: boolean;
}

interface CallGraph {
  nodes: Map<string, ResolvedFunc>;
  callsOut: Map<string, Set<string>>;
  // HTTP callsites recorded inside a function/method, with the verb
  // + url so we can match them to backend endpoints later.
  httpCalls: Map<string, Array<{ verb: string; url: string }>>;
}

function funcId(ref: CliFuncRef): string {
  return `${ref.file}::${ref.className ? ref.className + '.' : ''}${ref.name}`;
}

function collectDeclarations(project: Project, repoRoot: string): {
  functionsByName: Map<string, ResolvedFunc[]>;
  methodsByClassAndName: Map<string, ResolvedFunc>;
  knownClassNames: Set<string>;
  allNodes: Map<string, ResolvedFunc>;
} {
  const functionsByName = new Map<string, ResolvedFunc[]>();
  const methodsByClassAndName = new Map<string, ResolvedFunc>();
  const knownClassNames = new Set<string>();
  const allNodes = new Map<string, ResolvedFunc>();

  for (const sf of project.getSourceFiles()) {
    const file = path.relative(repoRoot, sf.getFilePath());
    for (const f of sf.getFunctions()) {
      const name = f.getName();
      if (!name) continue;
      const ref: CliFuncRef = { name, file };
      const node: ResolvedFunc = { id: funcId(ref), ref, isMethod: false };
      allNodes.set(node.id, node);
      const list = functionsByName.get(name) ?? [];
      list.push(node);
      functionsByName.set(name, list);
    }
    for (const cls of sf.getClasses()) {
      const className = cls.getName();
      if (className) knownClassNames.add(className);
      for (const m of cls.getMethods()) {
        const name = m.getName();
        const ref: CliFuncRef = {
          name,
          file,
          className: className ?? undefined,
        };
        const node: ResolvedFunc = { id: funcId(ref), ref, isMethod: true };
        allNodes.set(node.id, node);
        if (className) {
          methodsByClassAndName.set(`${className}.${name}`, node);
        }
      }
    }
  }
  return { functionsByName, methodsByClassAndName, knownClassNames, allNodes };
}

// Local var type inference. Captures:
//   - parameter type annotations:   function f(client: MentorApiClient)
//   - `const x = new ClassName(...)`
function localTypeMap(
  body: Node,
  params: ParameterDeclaration[],
  knownClassNames: Set<string>,
): Map<string, string> {
  const types = new Map<string, string>();
  for (const p of params) {
    const tn = p.getTypeNode();
    if (!tn) continue;
    const text = tn.getText().replace(/<.*$/, '').replace(/\[\]$/, '').trim();
    if (knownClassNames.has(text)) types.set(p.getName(), text);
  }
  body.forEachDescendant((d) => {
    if (d.getKind() !== SyntaxKind.VariableDeclaration) return;
    const vd = d as VariableDeclaration;
    const init = vd.getInitializer();
    if (!init || init.getKind() !== SyntaxKind.NewExpression) return;
    const expr = (init as NewExpression).getExpression();
    if (expr.getKind() !== SyntaxKind.Identifier) return;
    const className = (expr as Identifier).getText();
    if (knownClassNames.has(className)) {
      types.set(vd.getName(), className);
    }
  });
  return types;
}

function extractUrlArg(call: CallExpression): string | undefined {
  const args = call.getArguments();
  const first = args[0];
  if (!first) return undefined;
  if (Node.isStringLiteral(first)) return first.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(first)) return first.getLiteralValue();
  if (Node.isTemplateExpression(first)) return first.getText().replace(/^[`]|[`]$/g, '');
  return undefined;
}

function addEdge(graph: CallGraph, fromId: string, toId: string): void {
  let set = graph.callsOut.get(fromId);
  if (!set) {
    set = new Set();
    graph.callsOut.set(fromId, set);
  }
  set.add(toId);
}

function analyzeBody(
  ownerId: string,
  body: Node,
  params: ParameterDeclaration[],
  decls: ReturnType<typeof collectDeclarations>,
  graph: CallGraph,
): void {
  const types = localTypeMap(body, params, decls.knownClassNames);

  body.forEachDescendant((d) => {
    if (d.getKind() !== SyntaxKind.CallExpression) return;
    const call = d as CallExpression;
    const callee = call.getExpression();

    // Plain identifier call: foo(args).
    if (callee.getKind() === SyntaxKind.Identifier) {
      const name = (callee as Identifier).getText();
      const candidates = decls.functionsByName.get(name);
      if (candidates && candidates.length > 0) {
        const ownerFile = ownerId.split('::', 1)[0];
        const best =
          candidates.find((c) => c.ref.file === ownerFile) ?? candidates[0];
        addEdge(graph, ownerId, best.id);
      }
      return;
    }

    if (callee.getKind() !== SyntaxKind.PropertyAccessExpression) return;
    const pa = callee as PropertyAccessExpression;
    const methodName = pa.getName();
    const receiver = pa.getExpression();

    // HTTP callsite: this.<axiosInstance>.<verb>(<url>, ...).
    if (
      HTTP_VERBS.has(methodName.toLowerCase()) &&
      receiver.getKind() === SyntaxKind.PropertyAccessExpression
    ) {
      const inner = (receiver as PropertyAccessExpression).getExpression();
      if (inner.getKind() === SyntaxKind.ThisKeyword) {
        const url = extractUrlArg(call);
        if (url !== undefined) {
          const list = graph.httpCalls.get(ownerId) ?? [];
          list.push({ verb: methodName.toUpperCase(), url });
          graph.httpCalls.set(ownerId, list);
          return;
        }
      }
    }

    // Method on a typed local / parameter / this.
    let className: string | undefined;
    if (receiver.getKind() === SyntaxKind.Identifier) {
      const recvName = (receiver as Identifier).getText();
      className = types.get(recvName);
    } else if (receiver.getKind() === SyntaxKind.ThisKeyword) {
      const enclosing = pa.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
      if (enclosing) className = enclosing.getName();
    }
    if (!className) return;
    const target = decls.methodsByClassAndName.get(`${className}.${methodName}`);
    if (target) addEdge(graph, ownerId, target.id);
  });
}

function buildGraph(repoRoot: string): {
  graph: CallGraph;
  commandEntryIds: string[];
} {
  const cliRoot = path.join(repoRoot, 'cli', 'src');
  const empty: CallGraph = { nodes: new Map(), callsOut: new Map(), httpCalls: new Map() };
  if (!fs.existsSync(cliRoot)) return { graph: empty, commandEntryIds: [] };

  const project = new Project({
    compilerOptions: { noResolve: true, skipLibCheck: true, allowJs: false },
    skipFileDependencyResolution: true,
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths([
    path.join(cliRoot, '**', '*.ts').replace(/\\/g, '/'),
    '!' + path.join(cliRoot, '**', '*.test.ts').replace(/\\/g, '/'),
    '!' + path.join(cliRoot, '**', '*.spec.ts').replace(/\\/g, '/'),
  ]);

  const decls = collectDeclarations(project, repoRoot);
  const graph: CallGraph = {
    nodes: decls.allNodes,
    callsOut: new Map(),
    httpCalls: new Map(),
  };

  for (const sf of project.getSourceFiles()) {
    const file = path.relative(repoRoot, sf.getFilePath());
    for (const f of sf.getFunctions()) {
      const name = f.getName();
      if (!name) continue;
      const id = funcId({ name, file });
      const body = f.getBody();
      if (body) analyzeBody(id, body, f.getParameters(), decls, graph);
    }
    for (const cls of sf.getClasses()) {
      for (const m of cls.getMethods()) {
        const id = funcId({
          name: m.getName(),
          file,
          className: cls.getName() ?? undefined,
        });
        const body = m.getBody();
        if (body) analyzeBody(id, body, m.getParameters(), decls, graph);
      }
    }
  }

  const commandEntryIds: string[] = [];
  for (const [id, node] of graph.nodes) {
    if (!node.isMethod && COMMAND_ENTRIES.has(node.ref.name)) {
      commandEntryIds.push(id);
    }
  }
  return { graph, commandEntryIds };
}

// DFS from each command entry; record every reachable HTTP call
// along with the path that led to it. Cycle-safe (rejects nodes
// already on the current path). Depth-capped to keep big graphs
// bounded.
function findHttpReachingPaths(
  graph: CallGraph,
  commandEntryIds: string[],
): Array<{ chain: CliFuncRef[]; verb: string; url: string; terminalFile: string }> {
  const out: Array<{ chain: CliFuncRef[]; verb: string; url: string; terminalFile: string }> = [];
  const MAX_DEPTH = 12;

  for (const startId of commandEntryIds) {
    const stack: Array<{ id: string; path: string[]; depth: number }> = [
      { id: startId, path: [startId], depth: 0 },
    ];
    while (stack.length > 0) {
      const { id, path: cur, depth } = stack.pop()!;
      const calls = graph.httpCalls.get(id);
      if (calls) {
        for (const c of calls) {
          const chain = cur
            .map((n) => graph.nodes.get(n)?.ref)
            .filter((r): r is CliFuncRef => !!r);
          const terminalFile = chain[chain.length - 1]?.file ?? '';
          out.push({ chain, verb: c.verb, url: c.url, terminalFile });
        }
      }
      if (depth >= MAX_DEPTH) continue;
      const next = graph.callsOut.get(id);
      if (!next) continue;
      for (const callee of next) {
        if (cur.includes(callee)) continue;
        stack.push({ id: callee, path: [...cur, callee], depth: depth + 1 });
      }
    }
  }
  return out;
}

// Match a CLI url to a backend route. Strips /api prefix, treats
// `${var}` and `:param` as wildcards.
export function matchUrlToEndpoint(
  cliVerb: string,
  cliUrl: string,
  endpoints: Array<{ id: string; httpVerb: string; route: string }>,
): string | undefined {
  let clean = cliUrl.split('?')[0];
  if (clean.startsWith(API_PREFIX)) clean = clean.slice(API_PREFIX.length);
  if (!clean.startsWith('/')) clean = '/' + clean;
  const cliSegs = clean.split('/').filter(Boolean);

  for (const ep of endpoints) {
    if (ep.httpVerb !== cliVerb) continue;
    const pathPart = ep.route.split(' ', 2)[1] ?? ep.route;
    const beSegs = pathPart.split('/').filter(Boolean);
    if (beSegs.length !== cliSegs.length) continue;
    let ok = true;
    for (let i = 0; i < beSegs.length; i++) {
      const be = beSegs[i];
      const cl = cliSegs[i];
      const beWild = be.startsWith(':');
      const clWild = /^\$\{.+\}$/.test(cl);
      if (beWild || clWild) continue;
      if (be !== cl) {
        ok = false;
        break;
      }
    }
    if (ok) return ep.id;
  }
  return undefined;
}

export function annotateEndpointsWithCli(
  endpoints: Array<{ id: string; httpVerb: string; route: string; cliCallers: CliCaller[] }>,
  repoRoot: string,
): void {
  const { graph, commandEntryIds } = buildGraph(repoRoot);
  if (commandEntryIds.length === 0) return;

  const paths = findHttpReachingPaths(graph, commandEntryIds);
  if (paths.length === 0) return;

  // Group by (verb, url) so the same endpoint reached from multiple
  // commands becomes one CliCaller with multiple chains.
  const byCall = new Map<string, Array<{ chain: CliFuncRef[]; terminalFile: string }>>();
  for (const p of paths) {
    const key = `${p.verb} ${p.url}`;
    const list = byCall.get(key) ?? [];
    list.push({ chain: p.chain, terminalFile: p.terminalFile });
    byCall.set(key, list);
  }

  for (const [key, group] of byCall) {
    const [verb, url] = key.split(' ', 2);
    const epId = matchUrlToEndpoint(verb, url, endpoints);
    if (!epId) continue;
    const ep = endpoints.find((e) => e.id === epId);
    if (!ep) continue;

    // Dedupe chains (same endpoint reachable through different
    // intermediate paths in the same command produces duplicates).
    const seen = new Set<string>();
    const chains: CliFuncRef[][] = [];
    for (const g of group) {
      const key2 = g.chain.map((c) => funcId(c)).join(' -> ');
      if (seen.has(key2)) continue;
      seen.add(key2);
      chains.push(g.chain);
    }

    const repTerminal = group[0].chain[group[0].chain.length - 1];
    const triggeringCommands = Array.from(
      new Set(group.map((g) => COMMAND_LABEL[g.chain[0].name] ?? g.chain[0].name)),
    );

    ep.cliCallers.push({
      className: repTerminal?.className ?? '<unknown>',
      method: repTerminal?.name ?? '<unknown>',
      verb,
      url,
      file: group[0].terminalFile,
      chains,
      triggeringCommands,
    });
  }
}
