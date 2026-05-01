import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { Phase } from '../../phase-tagger/models/phase.types';
import {
  Rubric,
  RubricAiUsage,
  RubricPassBar,
  RubricRequiredSection,
  RubricScoring,
  RubricSignal,
  RubricTimeBounds,
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
};

type RawSection = { id: string; name: string; must_contain: string[] };

type RawRubric = {
  schema_version: number;
  rubric_version: string;
  phase: Phase;
  phase_name: string;
  goal: string;
  time_bounds: {
    target_min_minutes: number;
    target_max_minutes: number;
    flag_under_minutes: number;
    flag_over_minutes: number;
    note?: string;
  };
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
    anchors: Record<string, string>;
    calibration_note?: string;
  };
  output_schema: Record<string, unknown>;
};

const SUPPORTED_SCHEMA_VERSION = 1;

@Injectable()
export class RubricLoaderService {
  private readonly logger = new Logger(RubricLoaderService.name);
  private readonly cache = new Map<string, Rubric>();

  constructor(private readonly config: ConfigService) {}

  async load(version: string, phase: Phase): Promise<Rubric> {
    const cacheKey = `${version}/${phase}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const rubricDir = this.config.get<string>('rubric.dir') ?? './rubrics';
    const filePath = path.resolve(rubricDir, version, `${phase}.yaml`);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      throw new NotFoundException(`Rubric not found at ${filePath}`);
    }

    const parsed = yaml.load(raw) as RawRubric;
    const rubric = this.toRubric(parsed, filePath);
    this.cache.set(cacheKey, rubric);
    return rubric;
  }

  private toRubric(raw: RawRubric, filePath: string): Rubric {
    if (raw.schema_version !== SUPPORTED_SCHEMA_VERSION) {
      throw new Error(
        `${filePath}: unsupported schema_version ${raw.schema_version} (expected ${SUPPORTED_SCHEMA_VERSION})`,
      );
    }

    const passBar: RubricPassBar = {
      description: raw.pass_bar.description,
      requiredArtifact: raw.pass_bar.required_artifact,
      temporalCheck: raw.pass_bar.temporal_check,
      requiredSections: raw.pass_bar.required_sections.map(
        (s): RubricRequiredSection => ({
          id: s.id,
          name: s.name,
          mustContain: s.must_contain,
        }),
      ),
    };

    const signals: RubricSignal[] = raw.signals.map((s) => ({
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
    }));

    this.assertUniqueSignalIds(signals, filePath);
    this.assertPairsAreSymmetric(signals, filePath);

    const timeBounds: RubricTimeBounds = {
      targetMinMinutes: raw.time_bounds.target_min_minutes,
      targetMaxMinutes: raw.time_bounds.target_max_minutes,
      flagUnderMinutes: raw.time_bounds.flag_under_minutes,
      flagOverMinutes: raw.time_bounds.flag_over_minutes,
      note: raw.time_bounds.note,
    };

    const anchors: Record<number, string> = {};
    for (const [k, v] of Object.entries(raw.scoring.anchors)) {
      anchors[Number(k)] = v;
    }

    const scoring: RubricScoring = {
      scaleMin: raw.scoring.scale_min,
      scaleMax: raw.scoring.scale_max,
      defaultScore: raw.scoring.default_score,
      computation: raw.scoring.computation,
      anchors,
      calibrationNote: raw.scoring.calibration_note,
    };

    const aiUsage: RubricAiUsage | undefined = raw.ai_usage_for_this_phase
      ? {
          description: raw.ai_usage_for_this_phase.description,
          goodModes: raw.ai_usage_for_this_phase.good_modes,
          badModes: raw.ai_usage_for_this_phase.bad_modes,
          additionalNote: raw.ai_usage_for_this_phase.additional_note,
        }
      : undefined;

    return {
      schemaVersion: raw.schema_version,
      rubricVersion: raw.rubric_version,
      phase: raw.phase,
      phaseName: raw.phase_name,
      goal: raw.goal,
      timeBounds,
      weightValues: raw.weight_values,
      passBar,
      signals,
      aiUsageForThisPhase: aiUsage,
      artifactsToInspect: raw.artifacts_to_inspect,
      judgeCalibration: raw.judge_calibration,
      scoring,
      outputSchema: raw.output_schema,
    };
  }

  private assertUniqueSignalIds(signals: RubricSignal[], filePath: string) {
    const seen = new Set<string>();
    for (const s of signals) {
      if (seen.has(s.id)) {
        throw new Error(`${filePath}: duplicate signal id "${s.id}"`);
      }
      seen.add(s.id);
    }
  }

  // Pair declarations must be symmetric: if A says paired_with: B, then B
  // must say paired_with: A. Catches typos in YAML at load time rather
  // than letting the LLM see an inconsistent pairing reference.
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
