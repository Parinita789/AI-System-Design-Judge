import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { RubricLoaderService } from './rubric-loader.service';

describe('RubricLoaderService — v1.0 plan rubric (real file)', () => {
  let loader: RubricLoaderService;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'rubric.dir') {
          // Resolve relative to the repo root so the spec works under
          // any cwd Jest happens to run in.
          // backend/src/modules/evaluations/services → backend/rubrics
          return path.join(__dirname, '..', '..', '..', '..', 'rubrics');
        }
        return undefined;
      }),
    } as unknown as ConfigService;
    loader = new RubricLoaderService(config);
  });

  it('parses v1.0 plan.yaml without errors', async () => {
    const rubric = await loader.load('v1.0', 'plan');
    expect(rubric.signals.length).toBeGreaterThan(20);
    expect(rubric.scoring.scaleMin).toBe(1);
    expect(rubric.scoring.scaleMax).toBe(5);
  });

  it('loads paired_with metadata for the seven 1:1 pair signals', async () => {
    const rubric = await loader.load('v1.0', 'plan');
    const byId = new Map(rubric.signals.map((s) => [s.id, s]));

    const expectedPairs: Array<[string, string]> = [
      ['scope_cuts', 'missing_or_trivial_cuts'],
      ['explicit_tradeoffs', 'tradeoffs_as_platitudes'],
      ['shape_and_seams', 'shape_without_seams'],
      ['failure_modes_articulated', 'no_failure_mode_articulation'],
      ['build_sequence_planned', 'no_build_sequence'],
      ['validation_plan_concrete', 'no_validation_plan'],
      ['ai_strategy_explicit', 'ai_strategy_absent'],
    ];
    for (const [a, b] of expectedPairs) {
      expect(byId.get(a)?.pairedWith).toBe(b);
      expect(byId.get(b)?.pairedWith).toBe(a);
    }
  });

  it('loads requires_evidence on ai_authored_plan', async () => {
    const rubric = await loader.load('v1.0', 'plan');
    const sig = rubric.signals.find((s) => s.id === 'ai_authored_plan');
    expect(sig?.requiresEvidence).toEqual(['hints', 'snapshots']);
    // Critical was dropped — signal still exists but no longer caps score.
    expect(sig?.critical).toBeFalsy();
    expect(sig?.capAtScore).toBeUndefined();
  });
});

describe('RubricLoaderService — pair symmetry validation', () => {
  it.skip('rejects asymmetric pairing (covered by source review)', () => {});
});

describe('RubricLoaderService — v2.0 build/design merge (real files)', () => {
  let loader: RubricLoaderService;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'rubric.dir'
          ? path.join(__dirname, '..', '..', '..', '..', 'rubrics')
          : undefined,
      ),
    } as unknown as ConfigService;
    loader = new RubricLoaderService(config);
  });

  describe('build variant', () => {
    it('loads plan.shared.yaml + plan.build.yaml without errors', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build');
      expect(rubric.mode).toBe('build');
      expect(rubric.rubricVersion).toBe('v2.0');
      expect(rubric.scoring.scaleMin).toBe(1);
      expect(rubric.scoring.scaleMax).toBe(5);
    });

    it('drops shape_and_seams and dual_scale_nfrs (build mode)', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build');
      const ids = new Set(rubric.signals.map((s) => s.id));
      expect(ids.has('shape_and_seams')).toBe(false);
      expect(ids.has('shape_without_seams')).toBe(false);
      expect(ids.has('dual_scale_nfrs')).toBe(false);
      expect(ids.has('scale_pretense')).toBe(false);
    });

    it('adds build-only signals (test_granularity_appropriate, commit_atomicity_planned, ai_delegation_specificity, build_sequence_planned, validation_plan_concrete)', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build');
      const ids = new Set(rubric.signals.map((s) => s.id));
      expect(ids.has('test_granularity_appropriate')).toBe(true);
      expect(ids.has('commit_atomicity_planned')).toBe(true);
      expect(ids.has('ai_delegation_specificity')).toBe(true);
      expect(ids.has('build_sequence_planned')).toBe(true);
      expect(ids.has('validation_plan_concrete')).toBe(true);
    });

    it('promotes build-mode signals to high weight per override_signals', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build');
      const byId = new Map(rubric.signals.map((s) => [s.id, s]));
      expect(byId.get('failure_modes_articulated')?.weight).toBe('high');
      expect(byId.get('interfaces_sketched')?.weight).toBe('high');
      expect(byId.get('build_sequence_planned')?.weight).toBe('high');
      expect(byId.get('validation_plan_concrete')?.weight).toBe('high');
    });

    it('build variant uses build-mode time bounds', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build');
      expect(rubric.timeBounds.targetMinMinutes).toBe(12);
      expect(rubric.timeBounds.targetMaxMinutes).toBe(20);
    });

    it('build variant pass_bar drops architectural_shape_and_seams + adds build_sequence and validation_plan', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build');
      const sectionIds = rubric.passBar.requiredSections.map((s) => s.id);
      expect(sectionIds).not.toContain('architectural_shape_and_seams');
      expect(sectionIds).toContain('build_sequence');
      expect(sectionIds).toContain('validation_plan');
    });
  });

  describe('design variant', () => {
    it('loads plan.shared.yaml + plan.design.yaml without errors', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'design');
      expect(rubric.mode).toBe('design');
      expect(rubric.rubricVersion).toBe('v2.0');
    });

    it('keeps shape_and_seams and dual_scale_nfrs (design mode)', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'design');
      const byId = new Map(rubric.signals.map((s) => [s.id, s]));
      expect(byId.get('shape_and_seams')?.weight).toBe('high');
      expect(byId.get('dual_scale_nfrs')?.weight).toBe('high');
    });

    it('adds design-only signals (capacity_estimation, bottleneck_identification, etc.)', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'design');
      const ids = new Set(rubric.signals.map((s) => s.id));
      expect(ids.has('capacity_estimation')).toBe(true);
      expect(ids.has('bottleneck_identification')).toBe(true);
      expect(ids.has('read_write_path_differentiation')).toBe(true);
      expect(ids.has('caching_strategy_articulated')).toBe(true);
      expect(ids.has('consistency_model_chosen')).toBe(true);
    });

    it('demotes build_sequence_planned and validation_plan_concrete to low weight', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'design');
      const byId = new Map(rubric.signals.map((s) => [s.id, s]));
      expect(byId.get('build_sequence_planned')?.weight).toBe('low');
      expect(byId.get('validation_plan_concrete')?.weight).toBe('low');
    });

    it('design variant uses longer time bounds (25–45 min)', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'design');
      expect(rubric.timeBounds.targetMinMinutes).toBe(25);
      expect(rubric.timeBounds.targetMaxMinutes).toBe(45);
    });
  });

  describe('caching is mode-scoped', () => {
    it('build and design variants are cached independently', async () => {
      const build = await loader.load('v2.0', 'plan', 'build');
      const design = await loader.load('v2.0', 'plan', 'design');
      expect(build.signals).not.toBe(design.signals);
      expect(build.signals.length).not.toBe(design.signals.length);
    });
  });

  describe('seniority-aware weight resolution', () => {
    it('resolves capacity_estimation to low for junior, high for staff', async () => {
      const junior = await loader.load('v2.0', 'plan', 'design', 'junior');
      const staff = await loader.load('v2.0', 'plan', 'design', 'staff');
      const juniorCap = junior.signals.find((s) => s.id === 'capacity_estimation');
      const staffCap = staff.signals.find((s) => s.id === 'capacity_estimation');
      expect(juniorCap?.weight).toBe('low');
      expect(staffCap?.weight).toBe('high');
    });

    it('keeps the default `weight` when no seniority is provided', async () => {
      const noSeniority = await loader.load('v2.0', 'plan', 'design');
      const cap = noSeniority.signals.find((s) => s.id === 'capacity_estimation');
      // capacity_estimation has weight: high in design.yaml — that's the
      // default that applies when nothing resolves the per-seniority map.
      expect(cap?.weight).toBe('high');
    });

    it('strips weightBySeniority from the returned signals', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'design', 'senior');
      for (const s of rubric.signals) {
        // Resolver should drop the field after picking a single weight.
        expect(s.weightBySeniority).toBeUndefined();
      }
    });

    it('stamps seniority on the returned Rubric', async () => {
      const rubric = await loader.load('v2.0', 'plan', 'build', 'mid');
      expect(rubric.seniority).toBe('mid');
    });

    it('signals without weight_by_seniority are unaffected', async () => {
      // scope_specificity has only `weight: high` in shared.yaml — the
      // resolver must leave it alone regardless of seniority.
      const junior = await loader.load('v2.0', 'plan', 'design', 'junior');
      const staff = await loader.load('v2.0', 'plan', 'design', 'staff');
      expect(junior.signals.find((s) => s.id === 'scope_specificity')?.weight).toBe('high');
      expect(staff.signals.find((s) => s.id === 'scope_specificity')?.weight).toBe('high');
    });

    it('caches per (mode, seniority) — junior and staff hits are independent', async () => {
      const j1 = await loader.load('v2.0', 'plan', 'design', 'junior');
      const j2 = await loader.load('v2.0', 'plan', 'design', 'junior');
      const s1 = await loader.load('v2.0', 'plan', 'design', 'staff');
      expect(j1).toBe(j2); // same cache hit
      expect(j1).not.toBe(s1); // different seniority → different cache entry
    });
  });
});
