import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  Fixture,
  FixtureExpectation,
  FixtureHint,
  FixtureSeniority,
  RubricMode,
  SignalMode,
} from './types';

const VALID_MODES: SignalMode[] = ['hit', 'partial', 'miss', 'credited', 'skipped'];
const VALID_RUBRIC_MODES: RubricMode[] = ['build', 'design'];
const VALID_SENIORITIES: FixtureSeniority[] = ['junior', 'mid', 'senior', 'staff'];

interface RawFixtureYaml {
  description?: string;
  question?: string;
  rubricVersion?: string;
  mode?: string;
  seniority?: string;
  expectedScore?: { min?: number; max?: number };
  expectedSignals?: Partial<Record<string, string[]>>;
  warnOnly?: boolean;
  hints?: Array<{
    occurredAt?: string;
    elapsedMinutes?: number;
    prompt?: string;
    response?: string;
  }>;
}

export function loadFixtures(rootDir: string, filter?: string): Fixture[] {
  const dirs = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !filter || name.includes(filter))
    .sort();

  if (dirs.length === 0) {
    throw new Error(
      `No fixtures matched filter=${filter ?? '(none)'} in ${rootDir}`,
    );
  }

  return dirs.map((name) => loadOne(rootDir, name));
}

function loadOne(rootDir: string, name: string): Fixture {
  const dir = path.join(rootDir, name);
  const yamlPath = path.join(dir, 'fixture.yaml');
  const planPath = path.join(dir, 'plan.md');

  if (!fs.existsSync(yamlPath)) {
    throw new Error(`Fixture ${name} is missing fixture.yaml at ${yamlPath}`);
  }
  if (!fs.existsSync(planPath)) {
    throw new Error(`Fixture ${name} is missing plan.md at ${planPath}`);
  }

  const raw = yaml.load(fs.readFileSync(yamlPath, 'utf8')) as RawFixtureYaml | null;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Fixture ${name}: fixture.yaml did not parse to an object`);
  }

  const description = requireString(raw.description, `${name}.description`);
  const question = requireString(raw.question, `${name}.question`);
  const rubricVersion = requireString(raw.rubricVersion, `${name}.rubricVersion`);
  const expectedScore = parseScoreRange(raw.expectedScore, name);
  const expectedSignals = parseExpectedSignals(raw.expectedSignals, name);

  let mode: RubricMode | undefined;
  if (raw.mode !== undefined) {
    if (!VALID_RUBRIC_MODES.includes(raw.mode as RubricMode)) {
      throw new Error(
        `${name}: mode "${raw.mode}" must be one of: ${VALID_RUBRIC_MODES.join(', ')}`,
      );
    }
    mode = raw.mode as RubricMode;
  } else if (rubricVersion !== 'v1.0') {
    throw new Error(
      `${name}: mode is required when rubricVersion is "${rubricVersion}" (v2.0+ rubrics)`,
    );
  }

  let seniority: FixtureSeniority | undefined;
  if (raw.seniority !== undefined) {
    if (!VALID_SENIORITIES.includes(raw.seniority as FixtureSeniority)) {
      throw new Error(
        `${name}: seniority "${raw.seniority}" must be one of: ${VALID_SENIORITIES.join(', ')}`,
      );
    }
    seniority = raw.seniority as FixtureSeniority;
  }

  const planMd = fs.readFileSync(planPath, 'utf8');

  const hints: FixtureHint[] | undefined = raw.hints?.map((h, i) => ({
    occurredAt: requireString(h.occurredAt, `${name}.hints[${i}].occurredAt`),
    elapsedMinutes: requireNumber(h.elapsedMinutes, `${name}.hints[${i}].elapsedMinutes`),
    prompt: requireString(h.prompt, `${name}.hints[${i}].prompt`),
    response: requireString(h.response, `${name}.hints[${i}].response`),
  }));

  return {
    name,
    description,
    question,
    rubricVersion,
    mode,
    seniority,
    planMd: planMd.length > 0 ? planMd : null,
    expectedScore,
    expectedSignals,
    warnOnly: raw.warnOnly === true,
    hints,
  };
}

function parseScoreRange(
  raw: { min?: number; max?: number } | undefined,
  name: string,
): { min: number; max: number } {
  if (!raw) throw new Error(`${name}: expectedScore missing`);
  const min = requireNumber(raw.min, `${name}.expectedScore.min`);
  const max = requireNumber(raw.max, `${name}.expectedScore.max`);
  if (min > max) throw new Error(`${name}: expectedScore.min > max`);
  return { min, max };
}

function parseExpectedSignals(
  raw: Partial<Record<string, string[]>> | undefined,
  name: string,
): FixtureExpectation['expectedSignals'] {
  if (!raw) return {};
  const out: FixtureExpectation['expectedSignals'] = {};
  for (const [mode, ids] of Object.entries(raw)) {
    if (!VALID_MODES.includes(mode as SignalMode)) {
      throw new Error(
        `${name}: unknown signal mode "${mode}" — valid: ${VALID_MODES.join(', ')}`,
      );
    }
    if (!Array.isArray(ids)) {
      throw new Error(`${name}: expectedSignals.${mode} must be an array`);
    }
    out[mode as SignalMode] = ids;
  }
  return out;
}

function requireString(v: unknown, key: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${key}: expected non-empty string`);
  }
  return v;
}

function requireNumber(v: unknown, key: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${key}: expected finite number`);
  }
  return v;
}

export function validateAgainstRubric(
  fixture: Fixture,
  rubricSignalIds: ReadonlySet<string>,
): void {
  const unknown: string[] = [];
  for (const ids of Object.values(fixture.expectedSignals)) {
    for (const id of ids ?? []) {
      if (!rubricSignalIds.has(id)) unknown.push(id);
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Fixture ${fixture.name}: unknown signal IDs in expectedSignals: ${unknown.join(', ')}`,
    );
  }
}
