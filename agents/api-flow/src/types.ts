// Shared shapes for the JSON the extractor emits and the Python
// renderer consumes.

export type CallNodeType =
  | 'method'        // a normal class method (resolved via DI)
  | 'prisma'        // this.prisma.<model>.<op>(...) — leaf
  | 'external'      // call to an imported npm symbol — leaf
  | 'unresolved'    // this.X.Y where we couldn't resolve X's type
  | 'cycle'         // hit a method already on the stack
  | 'truncated';    // depth cap hit

export interface CallNode {
  // Stable id for graph rendering. For 'method', this is
  // 'ClassName.methodName'. Other types: a descriptive label.
  id: string;
  type: CallNodeType;
  // Human-readable label, e.g. 'EvaluationsService.runForSession'
  // or '[DB] phaseEvaluation.create' or '[ext] anthropic.messages.create'.
  label: string;
  // Repo-relative file where the method lives (omitted for prisma/external).
  file?: string;
  children: CallNode[];
}

// A single function/method in the CLI. Used to render call chains.
export interface CliFuncRef {
  name: string;             // function or method name
  className?: string;       // populated when it's a method
  file: string;             // cli/src/<...>.ts
}

// One callsite inside the cli/ package that hits a backend endpoint.
// `chains` is the new field: each chain is an ordered list of CLI
// functions from a top-level command entry (e.g. runWatch) down to
// the ApiClient method that issues the HTTP call. The diagram uses
// this to draw the full path through cli code rather than just the
// ApiClient leaf.
export interface CliCaller {
  className: string;        // ApiClient class, e.g. 'MentorApiClient'
  method: string;           // ApiClient method that contains the HTTP call
  verb: string;             // 'GET' | 'POST' | ...
  url: string;              // URL pattern as written in source
  file: string;             // cli/src/<...>.ts where the HTTP call lives
  // One chain per distinct command entry that ultimately reaches
  // this ApiClient method. Last element = the ApiClient method;
  // first element = a command entry (runWatch / runFinish / etc.).
  chains: CliFuncRef[][];
  // Top-level command names that trigger this endpoint, deduped.
  triggeringCommands: string[];
}

export interface Endpoint {
  // Stable id usable as URL hash, e.g. 'POST--sessions--sessionId--evaluate'.
  id: string;
  module: string;            // top-level module name (e.g. 'evaluations')
  controller: string;        // class name (e.g. 'EvaluationsController')
  controllerFile: string;    // repo-relative path
  method: string;            // handler method name (e.g. 'runForSession')
  httpVerb: string;          // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  route: string;             // full path including @Controller prefix
  callTree: CallNode;        // root = the controller method itself
  cliCallers: CliCaller[];   // [] when no CLI caller hits this endpoint
  // Diagnostics for debugging the extractor itself.
  stats: {
    nodeCount: number;
    maxDepth: number;
    unresolvedCount: number;
    cycleCount: number;
  };
}

export interface ApiFlowOutput {
  package: string;
  generatedAt: string;
  endpoints: Endpoint[];
}
