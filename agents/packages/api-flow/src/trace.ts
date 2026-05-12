import {
  ClassDeclaration,
  MethodDeclaration,
  Project,
  SyntaxKind,
  Node,
  CallExpression,
  PropertyAccessExpression,
  ConstructorDeclaration,
  ParameterDeclaration,
} from 'ts-morph';
import * as path from 'node:path';
import { CallNode } from './types';

const MAX_DEPTH = 12;

export interface TraceContext {
  project: Project;
  repoRoot: string;
}

// Map: <fully-qualified class name>.<method name> → its declaration.
// Built lazily so we don't pay for resolving methods we never trace.
function findMethod(
  project: Project,
  className: string,
  methodName: string,
): MethodDeclaration | undefined {
  // Walk every source file looking for the class. Slow but correct;
  // this codebase is small enough that one-time cost is acceptable.
  for (const sf of project.getSourceFiles()) {
    const cls = sf.getClass(className);
    if (cls) {
      const m = cls.getMethod(methodName);
      if (m) return m;
    }
  }
  return undefined;
}

// Read the controller's (or service's) constructor and produce a
// map from injected-property-name → type-name. e.g. for:
//   constructor(private readonly evals: EvaluationsService) {}
// returns { evals: 'EvaluationsService' }.
//
// Handles common NestJS DI patterns:
//   - parameter property (`private readonly x: X`)
//   - `@Inject(SomeToken)` — captured by parameter name even though
//     the token is opaque
//   - `@Inject(forwardRef(() => Y))` — we read Y from the forwardRef
//     callback's return type if it's a TypeReference
function injectionMap(cls: ClassDeclaration): Record<string, string> {
  const ctor = cls.getConstructors()[0];
  if (!ctor) return {};
  const map: Record<string, string> = {};
  for (const param of ctor.getParameters()) {
    const name = param.getName();
    const typeName = paramTypeName(param);
    if (typeName) map[name] = typeName;
  }
  return map;
}

function paramTypeName(param: ParameterDeclaration): string | undefined {
  // First try the declared type node — gives a clean TypeReference name
  // even when the type's fully-qualified form is verbose.
  const tn = param.getTypeNode();
  if (tn) {
    const text = tn.getText();
    // Strip generics + array brackets for the class name lookup.
    const base = text.replace(/<.*$/, '').replace(/\[\]$/, '').trim();
    if (base && /^[A-Z][A-Za-z0-9_]*$/.test(base)) return base;
  }
  // Fall back to the resolved type symbol.
  const symbol = param.getType().getSymbol();
  if (symbol) {
    const decl = symbol.getDeclarations()[0];
    if (decl && Node.isClassDeclaration(decl)) {
      return decl.getName();
    }
  }
  return undefined;
}

// Walk the chained property-access expression to capture the head
// receiver and the trailing call site. For `this.foo.bar.baz(x)`
// returns { head: 'this', chain: ['foo', 'bar', 'baz'] }.
function decomposeCall(
  callExpr: CallExpression,
): { head: 'this' | 'other'; chain: string[] } | undefined {
  const expr = callExpr.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return undefined;
  const chain: string[] = [];
  let cur: Node = expr;
  while (Node.isPropertyAccessExpression(cur)) {
    chain.unshift(cur.getName());
    cur = cur.getExpression();
  }
  if (cur.getKind() === SyntaxKind.ThisKeyword) {
    return { head: 'this', chain };
  }
  return { head: 'other', chain };
}

// Detect Prisma chains: `this.prisma.<model>.<op>(...)` — the
// canonical pattern in this codebase. The model name and the op
// (findUnique, create, ...) are the second and third chain
// elements. The chain may have additional fluent calls after
// (rare for Prisma; uncommon enough to ignore for v1).
function asPrismaLeaf(chain: string[]): CallNode | undefined {
  if (chain.length < 3) return undefined;
  if (chain[0] !== 'prisma') return undefined;
  const model = chain[1];
  const op = chain[2];
  return {
    id: `prisma.${model}.${op}`,
    type: 'prisma',
    label: `[DB] ${model}.${op}`,
    children: [],
  };
}

// `await` wrapping doesn't affect dispatch — unwrap to the inner
// CallExpression so `await this.x.y()` and `this.x.y()` produce the
// same node.
function callExpressionsInBody(method: MethodDeclaration): CallExpression[] {
  const body = method.getBody();
  if (!body) return [];
  return body.getDescendantsOfKind(SyntaxKind.CallExpression);
}

export function traceMethod(
  ctx: TraceContext,
  ownerClass: ClassDeclaration,
  method: MethodDeclaration,
  visited: Set<string>,
  depth: number,
): CallNode {
  const className = ownerClass.getName() ?? '<anonymous>';
  const methodName = method.getName();
  const nodeKey = `${className}.${methodName}`;

  const file = path.relative(
    ctx.repoRoot,
    method.getSourceFile().getFilePath(),
  );

  if (depth >= MAX_DEPTH) {
    return {
      id: nodeKey,
      type: 'truncated',
      label: `${nodeKey} … (depth ${depth} cap)`,
      file,
      children: [],
    };
  }
  if (visited.has(nodeKey)) {
    return {
      id: nodeKey,
      type: 'cycle',
      label: `↻ ${nodeKey}`,
      file,
      children: [],
    };
  }
  visited.add(nodeKey);
  try {
    const injMap = injectionMap(ownerClass);
    const children: CallNode[] = [];
    // Dedupe identical child calls — looping over the same line N
    // times is noise.
    const seen = new Set<string>();

    for (const call of callExpressionsInBody(method)) {
      const decomp = decomposeCall(call);
      if (!decomp || decomp.head !== 'this' || decomp.chain.length < 2) continue;

      // Prisma short-circuit.
      const prisma = asPrismaLeaf(decomp.chain);
      if (prisma) {
        if (!seen.has(prisma.id)) {
          seen.add(prisma.id);
          children.push(prisma);
        }
        continue;
      }

      // Standard NestJS DI: this.<prop>.<method>(...)
      // Chain length 2 = `this.someService.method` (no nested access).
      if (decomp.chain.length !== 2) {
        // Deeper chains (e.g. this.x.subProp.method) we don't resolve.
        const id = `unresolved.${decomp.chain.join('.')}`;
        if (!seen.has(id)) {
          seen.add(id);
          children.push({
            id,
            type: 'unresolved',
            label: `[?] this.${decomp.chain.join('.')}()`,
            children: [],
          });
        }
        continue;
      }
      const [propName, callee] = decomp.chain;
      const typeName = injMap[propName];
      if (!typeName) {
        const id = `unresolved.${propName}.${callee}`;
        if (!seen.has(id)) {
          seen.add(id);
          children.push({
            id,
            type: 'unresolved',
            label: `[?] this.${propName}.${callee}()`,
            children: [],
          });
        }
        continue;
      }
      const targetCls = ctx.project
        .getSourceFiles()
        .map((sf) => sf.getClass(typeName))
        .find((c): c is ClassDeclaration => !!c);
      if (!targetCls) {
        const id = `unresolved.${typeName}.${callee}`;
        if (!seen.has(id)) {
          seen.add(id);
          children.push({
            id,
            type: 'unresolved',
            label: `[?] ${typeName}.${callee}()`,
            children: [],
          });
        }
        continue;
      }
      const targetMethod = targetCls.getMethod(callee);
      if (!targetMethod) {
        // Method not declared on the class (could be inherited from
        // a base class — base-phase.agent.ts has subclasses).
        // Try base class methods one level up.
        let base = targetCls.getBaseClass();
        let found: MethodDeclaration | undefined;
        let foundOn: ClassDeclaration | undefined;
        while (base && !found) {
          found = base.getMethod(callee);
          if (found) foundOn = base;
          base = base.getBaseClass();
        }
        if (found && foundOn) {
          const id = `${targetCls.getName() ?? typeName}.${callee}`;
          if (!seen.has(id)) {
            seen.add(id);
            children.push(traceMethod(ctx, foundOn, found, visited, depth + 1));
          }
          continue;
        }
        const id = `unresolved.${typeName}.${callee}`;
        if (!seen.has(id)) {
          seen.add(id);
          children.push({
            id,
            type: 'unresolved',
            label: `[?] ${typeName}.${callee}()`,
            children: [],
          });
        }
        continue;
      }
      const id = `${typeName}.${callee}`;
      if (seen.has(id)) continue;
      seen.add(id);
      children.push(traceMethod(ctx, targetCls, targetMethod, visited, depth + 1));
    }

    return {
      id: nodeKey,
      type: 'method',
      label: nodeKey,
      file,
      children,
    };
  } finally {
    visited.delete(nodeKey);
  }
}
