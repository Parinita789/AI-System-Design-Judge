import { loadIssuesIndex } from './load-issues';

export interface StatusCmdOptions {
  outputDir: string;
  issueId: string;
}

export function runStatusCmd(
  opts: StatusCmdOptions,
  log: (s: string) => void = console.log,
): number {
  const index = loadIssuesIndex(opts.outputDir);
  const issue = index.issues.find((i) => i.id.startsWith(opts.issueId));
  if (!issue) {
    log(`No issue matching id "${opts.issueId}".`);
    return 1;
  }
  log(`Issue ${issue.id}`);
  log(`  module:       ${issue.module}`);
  log(`  file:         ${issue.file}`);
  log(`  axis:         ${issue.axis}`);
  log(`  fingerprint:  ${issue.fingerprint}`);
  log(`  status:       ${issue.status}`);
  log(`  severity:     ${issue.lastSeverity}`);
  log(`  firstSeen:    ${issue.firstSeen}`);
  log(`  lastSeen:     ${issue.lastSeen}`);
  if (issue.fixedInRun) log(`  fixedInRun:   ${issue.fixedInRun}`);
  if (issue.manualNote) log(`  manualNote:   ${issue.manualNote}`);
  log('');
  log('  Last issue text:');
  log(indent(issue.lastIssueText, '    '));
  return 0;
}

function indent(s: string, p: string): string {
  return s
    .split('\n')
    .map((l) => p + l)
    .join('\n');
}
