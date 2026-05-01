import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Phase } from '../../phase-tagger/models/phase.types';
import {
  Mode,
  Rubric,
  RubricAiUsage,
  RubricPassBar,
  RubricRequiredSection,
  RubricScoring,
  RubricSignal,
  RubricTimeBounds,
  SENIORITIES,
  Seniority,
  WeightTier,
} from '../models/rubric.types';

type RawSignal = {
  id: string;
  polarity: 'good' | 'bad';
  weight: WeightTier;
  description: string;
  judge_notes: string;
  evidence_hint?: string;
  critical?: boolean;
  cap_at_score?: number;
  paired_with?: string;
  requires_evidence?: string[];
  weight_by_seniority?: Record<string, WeightTier>;
};

type RawSection = { id: string; name: string; must_contain: string[] };

// Shared (v2.0) and v1.0 single-file rubric share the same shape, but the
// shared file omits a few variant-only fields (rubric_version, phase_name,
// goal, time_bounds, scoring.anchors, scoring.calibration_note). The
// schema is a permissive intersection so we can parse both.
type RawSharedRubric = {
  schema_version: number;
  rubric_version?: string;
  phase: Phase;
  phase_name?: string;
  goal?: string;
  time_bounds?: RawTimeBounds;
  weight_values: Record<WeightTier, number>;
  pass_bar: {
    description: string;
    required_artifact: string;
    temporal_check: string;
    required_sections: RawSection[];
  };
  signals: RawSignal[];
  ai_usage_for_this_phase?: {
    description: string;
    good_modes: string[];
    bad_modes: string[];
    additional_note?: string;
  };
  artifacts_to_inspect: string[];
  judge_calibration: string[];
  scoring: {
    scale_min: number;
    scale_max: number;
    default_score: number | null;
    computation: string;
    anchors?: Record<string, string>;
    calibration_note?: string;
  };
  output_schema: Record<string, unknown>;
};

type RawTimeBounds = {
  target_min_minutes: number;
  target_max_minutes: number;
  flag_under_minutes: number;
  flag_over_minutes: number;
  note?: string;
};

// Variant file shape (v2.0+ build/design). Variant overrides shared.
type RawVariantRubric = {
  schema_version: number;
  rubric_version: string;
  phase: Phase;
  mode: Mode;
  phase_name: string;
  extends?: string;
  goal: string;
  time_bounds: RawTimeBounds;
  override_signals?: Record<string, { weight?: WeightTier; drop?: boolean }>;
  add_signals?: RawSignal[];
  override_pass_bar?: {
    drop_sections?: string[];
    add_sections?: RawSection[];
  };
  scoring: {
    anchors: Record<string, string>;
    calibration_note?: string;
  };
};

const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);

@Injectable()
export class RubricLoaderService {
  private readonly logger = new Logger(RubricLoaderService.name);
  private readonly cache = new Map<string, Rubric>();

  constructor(private readonly config: ConfigService) {}

  // `mode` is required for v2.0+ rubrics (build vs design). For v1.0
  // rubrics it's ignored and the legacy single-file path is used.
  // `seniority` resolves per-signal `weight_by_seniority` maps to a
  // single weight; signals without the map are unaffected.
  async load(
    version: string,
    phase: Phase,
    mode?: Mode,
    seniority?: Seniority,
  ): Promise<Rubric> {
    const cacheKey = `${version}/${phase}/${mode ?? 'default'}/${seniority ?? 'default'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const rubricDir = this.config.get<string>('rubric.dir') ?? './rubrics';

    // Variant path: v2.0+ with mode → load shared + variant and merge.
    if (mode) {
      const sharedPath = path.resolve(rubricDir, version, `${phase}.shared.yaml`);
      const variantPath = path.resolve(rubricDir, version, `${phase}.${mode}.yaml`);
      if (await fileExists(sharedPath)) {
        const shared = parseYaml<RawSharedRubric>(
          await fs.readFile(sharedPath, 'utf-8'),
          sharedPath,
        );
        const variant = parseYaml<RawVariantRubric>(
          await fs.readFile(variantPath, 'utf-8').catch(() => {
            throw new NotFoundException(`Rubric variant not found at ${variantPath}`);
          }),
          variantPath,
        );
        const rubric = this.mergeSharedAndVariant(shared, variant, sharedPath, variantPath);
        const finalized = applySeniority(rubric, seniority);
        this.cache.set(cacheKey, finalized);
        return finalized;
      }
      // Fall through to legacy path if there's no shared file at this version.
    }

    // Legacy single-file path (v1.0) or v2.0+ without mode.
    const filePath = path.resolve(rubricDir, version, `${phase}.yaml`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      throw new NotFoundException(`Rubric not found at ${filePath}`);
    }
    const parsed = parseYaml<RawSharedRubric>(raw, filePath);
    const rubric = this.toRubric(parsed, filePath);
    const finalized = applySeniority(rubric, seniority);
    this.cache.set(cacheKey, finalized);
    return finalized;
  }

  // ──────────────────────────────────────────────────────────────────
  // Single-file rubric (v1.0) — mostly unchanged from before.

  private toRubric(raw: RawSharedRubric, filePath: string): Rubric {
    if (!SUPPORTED_SCHEMA_VERSIONS.has(raw.schema_version)) {
      throw new Error(
        `${filePath}: unsupported schema_version ${raw.schema_version} (expected one of ${[...SUPPORTED_SCHEMA_VERSIONS].join(', ')})`,
      );
    }

    if (!raw.rubric_version || !raw.phase_name || !raw.goal || !raw.time_bounds) {
      throw new Error(
        `${filePath}: single-file rubric is missing required fields (rubric_version, phase_name, goal, or time_bounds). For v2.0+, use shared+variant files instead.`,
      );
    }

    const passBar = toPassBar(raw.pass_bar);
    const signals = raw.signals.map(toSignal);

    this.assertUniqueSignalIds(signals, filePath);
    this.assertPairsAreSymmetric(signals, filePath);

    if (!raw.scoring.anchors) {
      throw new Error(`${filePath}: scoring.anchors is required for single-file rubrics`);
    }

    return {
      schemaVersion: raw.schema_version,
      rubricVersion: raw.rubric_version,
      phase: raw.phase,
      phaseName: raw.phase_name,
      goal: raw.goal,
      timeBounds: toTimeBounds(raw.time_bounds),
      weightValues: raw.weight_values,
      passBar,
      signals,
      aiUsageForThisPhase: toAiUsage(raw.ai_usage_for_this_phase),
      artifactsToInspect: raw.artifacts_to_inspect,
      judgeCalibration: raw.judge_calibration,
      scoring: toScoring(raw.scoring, raw.scoring.anchors),
      outputSchema: raw.output_schema,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Shared + variant merge (v2.0+).

  private mergeSharedAndVariant(
    shared: RawSharedRubric,
    variant: RawVariantRubric,
    sharedPath: string,
    variantPath: string,
  ): Rubric {
    if (!SUPPORTED_SCHEMA_VERSIONS.has(shared.schema_version)) {
      throw new Error(
        `${sharedPath}: unsupported schema_version ${shared.schema_version}`,
      );
    }
    if (!SUPPORTED_SCHEMA_VERSIONS.has(variant.schema_version)) {
      throw new Error(
        `${variantPath}: unsupported schema_version ${variant.schema_version}`,
      );
    }
    if (variant.phase !== shared.phase) {
      throw new Error(
        `${variantPath}: phase "${variant.phase}" does not match shared phase "${shared.phase}"`,
      );
    }

    // Start with the shared signal list, then apply override + add.
    const overrides = variant.override_signals ?? {};
    const startBase: RubricSignal[] = [];
    for (const s of shared.signals) {
      const patch = overrides[s.id];
      if (patch?.drop === true) continue;
      const merged = toSignal(s);
      if (patch?.weight) merged.weight = patch.weight;
      startBase.push(merged);
    }
    // Sanity-check: every override id must exist in shared.
    for (const id of Object.keys(overrides)) {
      if (!shared.signals.some((s) => s.id === id)) {
        throw new Error(
          `${variantPath}: override_signals references unknown signal id "${id}"`,
        );
      }
    }

    // Append variant-only signals.
    for (const raw of variant.add_signals ?? []) {
      startBase.push(toSignal(raw));
    }

    this.assertUniqueSignalIds(startBase, variantPath);
    this.assertPairsAreSymmetric(startBase, variantPath);

    // Pass bar — start with shared sections, drop, then add.
    const dropSet = new Set(variant.override_pass_bar?.drop_sections ?? []);
    const baseSections = shared.pass_bar.required_sections.filter(
      (s) => !dropSet.has(s.id),
    );
    const addedSections = variant.override_pass_bar?.add_sections ?? [];
    const passBar: RubricPassBar = {
      description: shared.pass_bar.description,
      requiredArtifact: shared.pass_bar.required_artifact,
      temporalCheck: shared.pass_bar.temporal_check,
      requiredSections: [...baseSections, ...addedSections].map(
        (s): RubricRequiredSection => ({
          id: s.id,
          name: s.name,
          mustContain: s.must_contain,
        }),
      ),
    };

    return {
      schemaVersion: variant.schema_version,
      rubricVersion: variant.rubric_version,
      phase: variant.phase,
      mode: variant.mode,
      phaseName: variant.phase_name,
      goal: variant.goal,
      timeBounds: toTimeBounds(variant.time_bounds),
      weightValues: shared.weight_values,
      passBar,
      signals: startBase,
      aiUsageForThisPhase: toAiUsage(shared.ai_usage_for_this_phase),
      artifactsToInspect: shared.artifacts_to_inspect,
      judgeCalibration: shared.judge_calibration,
      scoring: toScoring(shared.scoring, variant.scoring.anchors, variant.scoring.calibration_note),
      outputSchema: shared.output_schema,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Validators.

  private assertUniqueSignalIds(signals: RubricSignal[], filePath: string) {
    const seen = new Set<string>();
    for (const s of signals) {
      if (seen.has(s.id)) {
        throw new Error(`${filePath}: duplicate signal id "${s.id}"`);
      }
      seen.add(s.id);
    }
  }

  private assertPairsAreSymmetric(signals: RubricSignal[], filePath: string) {
    const byId = new Map(signals.map((s) => [s.id, s]));
    for (const s of signals) {
      if (!s.pairedWith) continue;
      const partner = byId.get(s.pairedWith);
      if (!partner) {
        throw new Error(
          `${filePath}: signal "${s.id}" pairs with unknown signal "${s.pairedWith}"`,
        );
      }
      if (partner.pairedWith !== s.id) {
        throw new Error(
          `${filePath}: pairing not symmetric — "${s.id}" paired_with "${s.pairedWith}", but "${s.pairedWith}".paired_with = "${partner.pairedWith ?? '(unset)'}"`,
        );
      }
      if (partner.polarity === s.polarity) {
        throw new Error(
          `${filePath}: signals "${s.id}" and "${s.pairedWith}" both have polarity "${s.polarity}" — pairs must cross polarity`,
        );
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Field-mapping helpers (shared between single-file and merged paths).

function toSignal(s: RawSignal): RubricSignal {
  let weightBySeniority: Record<Seniority, WeightTier> | undefined;
  if (s.weight_by_seniority) {
    // Reject partial maps — explicit beats implicit. All four levels
    // must be present so future YAML edits don't silently drop a level.
    const provided = Object.keys(s.weight_by_seniority);
    const missing = SENIORITIES.filter((lvl) => !(lvl in s.weight_by_seniority!));
    if (missing.length > 0) {
      throw new Error(
        `signal "${s.id}".weight_by_seniority is missing keys: ${missing.join(', ')} (provided: ${provided.join(', ') || '<empty>'})`,
      );
    }
    weightBySeniority = s.weight_by_seniority as Record<Seniority, WeightTier>;
  }
  return {
    id: s.id,
    polarity: s.polarity,
    weight: s.weight,
    description: s.description,
    judgeNotes: s.judge_notes,
    evidenceHint: s.evidence_hint,
    critical: s.critical,
    capAtScore: s.cap_at_score,
    pairedWith: s.paired_with,
    requiresEvidence: s.requires_evidence,
    weightBySeniority,
  };
}

function toPassBar(raw: RawSharedRubric['pass_bar']): RubricPassBar {
  return {
    description: raw.description,
    requiredArtifact: raw.required_artifact,
    temporalCheck: raw.temporal_check,
    requiredSections: raw.required_sections.map(
      (s): RubricRequiredSection => ({
        id: s.id,
        name: s.name,
        mustContain: s.must_contain,
      }),
    ),
  };
}

function toTimeBounds(raw: RawTimeBounds): RubricTimeBounds {
  return {
    targetMinMinutes: raw.target_min_minutes,
    targetMaxMinutes: raw.target_max_minutes,
    flagUnderMinutes: raw.flag_under_minutes,
    flagOverMinutes: raw.flag_over_minutes,
    note: raw.note,
  };
}

function toScoring(
  base: RawSharedRubric['scoring'],
  anchorsRaw: Record<string, string>,
  calibrationNoteOverride?: string,
): RubricScoring {
  const anchors: Record<number, string> = {};
  for (const [k, v] of Object.entries(anchorsRaw)) {
    anchors[Number(k)] = v;
  }
  return {
    scaleMin: base.scale_min,
    scaleMax: base.scale_max,
    defaultScore: base.default_score,
    computation: base.computation,
    anchors,
    calibrationNote: calibrationNoteOverride ?? base.calibration_note,
  };
}

function toAiUsage(
  raw: RawSharedRubric['ai_usage_for_this_phase'],
): RubricAiUsage | undefined {
  if (!raw) return undefined;
  return {
    description: raw.description,
    goodModes: raw.good_modes,
    badModes: raw.bad_modes,
    additionalNote: raw.additional_note,
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseYaml<T>(raw: string, filePath: string): T {
  try {
    return yaml.load(raw) as T;
  } catch (err) {
    throw new Error(`${filePath}: failed to parse YAML — ${(err as Error).message}`);
  }
}

// Resolve per-signal `weightBySeniority` maps to a single `weight` and
// stamp the seniority on the rubric. When seniority is undefined, the
// signal's default `weight` stands and `weightBySeniority` is dropped
// from the returned signal so downstream code never has to consider it.
// Returns a new Rubric — does not mutate the input.
function applySeniority(rubric: Rubric, seniority: Seniority | undefined): Rubric {
  const signals: RubricSignal[] = rubric.signals.map((s) => {
    const resolvedWeight =
      seniority && s.weightBySeniority ? s.weightBySeniority[seniority] : s.weight;
    // Strip weightBySeniority from the resolved signal — the field has
    // done its job. Downstream code (prompt rendering, score-computer)
    // sees a single weight per signal regardless of level.
    const { weightBySeniority: _drop, ...rest } = s;
    return { ...rest, weight: resolvedWeight };
  });
  return { ...rubric, seniority, signals };
}
