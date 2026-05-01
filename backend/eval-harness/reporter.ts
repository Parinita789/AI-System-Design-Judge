import * as fs from 'fs';
import * as path from 'path';
import { FixtureResult, SuiteReport } from './types';

const COL_NAME = 36;
const COL_SCORE = 6;
const COL_RANGE = 11;
const COL_SIGNALS = 8;
const COL_TIME = 7;
const COL_VERDICT = 8;

export function printConsoleReport(report: SuiteReport): void {
  // Header
  const head =
    pad('Fixture', COL_NAME) +
    ' | ' +
    pad('Score', COL_SCORE) +
    ' | ' +
    pad('Expected', COL_RANGE) +
    ' | ' +
    pad('Signals', COL_SIGNALS) +
    ' | ' +
    pad('Time', COL_TIME) +
    ' | ' +
    pad('Verdict', COL_VERDICT);
  const sep = '-'.repeat(head.length);
  process.stdout.write(`${head}\n${sep}\n`);

  for (const r of report.results) {
    process.stdout.write(formatRow(r) + '\n');
    for (const m of r.mismatches) {
      const evidence = m.actualEvidence
        ? ` ("${truncate(m.actualEvidence, 60)}")`
        : '';
      const tag = r.warnOnly ? '⚠' : '✗';
      process.stdout.write(
        `   ${tag} ${m.signalId} expected ${m.expectedMode}, got ${m.actualResult}${evidence}\n`,
      );
    }
  }

  const passed = report.results.filter((r) => r.pass).length;
  const total = report.results.length;
  process.stdout.write('\n');
  process.stdout.write(
    `${passed}/${total} fixtures passed in ${(report.totalElapsedMs / 1000).toFixed(1)}s ` +
      `on provider=${report.provider} model=${report.model} rubric=${report.rubricVersion}\n`,
  );
}

function formatRow(r: FixtureResult): string {
  const verdict = r.pass ? 'PASS' : r.warnOnly ? 'WARN' : 'FAIL';
  return (
    pad(r.name, COL_NAME) +
    ' | ' +
    pad(r.actualScore.toFixed(2), COL_SCORE) +
    ' | ' +
    pad(`${r.expectedScore.min.toFixed(1)}–${r.expectedScore.max.toFixed(1)}`, COL_RANGE) +
    ' | ' +
    pad(`${r.signalsMet}/${r.signalsExpected}`, COL_SIGNALS) +
    ' | ' +
    pad(`${(r.elapsedMs / 1000).toFixed(1)}s`, COL_TIME) +
    ' | ' +
    pad(verdict, COL_VERDICT)
  );
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function writeJsonReport(report: SuiteReport, outPath: string): void {
  const abs = path.resolve(outPath);
  fs.writeFileSync(abs, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`\nJSON report written to ${abs}\n`);
}
