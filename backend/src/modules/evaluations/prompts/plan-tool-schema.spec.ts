import { buildPlanEvalTool, SUBMIT_EVAL_TOOL_NAME } from './plan-tool-schema';
import { Rubric, RubricSignal } from '../types/rubric.types';

function signal(id: string, polarity: 'good' | 'bad' = 'good'): RubricSignal {
  return {
    id,
    polarity,
    weight: 'medium',
    description: 'd',
    judgeNotes: 'n',
  };
}

function rubric(signals: RubricSignal[]): Rubric {
  return {
    schemaVersion: 2,
    rubricVersion: 'v2.0',
    phase: 'plan',
    phaseName: 'Plan',
    goal: 'g',
    timeBounds: {
      targetMinMinutes: 30,
      targetMaxMinutes: 45,
      flagUnderMinutes: 15,
      flagOverMinutes: 60,
    },
    weightValues: { high: 3, medium: 2, low: 1 },
    passBar: {
      description: 'pb',
      requiredArtifact: 'plan.md',
      temporalCheck: 't',
      requiredSections: [],
    },
    signals,
    artifactsToInspect: [],
    judgeCalibration: [],
    scoring: {
      scaleMin: 1,
      scaleMax: 5,
      defaultScore: null,
      computation: 'c',
      anchors: {},
    },
    outputSchema: {},
  };
}

describe('buildPlanEvalTool', () => {
  it('uses the canonical tool name', () => {
    const tool = buildPlanEvalTool(rubric([signal('a')]));
    expect(tool.name).toBe(SUBMIT_EVAL_TOOL_NAME);
  });

  it('lists every rubric signal id under signals.required and properties', () => {
    const tool = buildPlanEvalTool(
      rubric([signal('a'), signal('b'), signal('c', 'bad')]),
    );
    const schema = tool.inputSchema as Record<string, unknown>;
    const props = (schema.properties as Record<string, unknown>).signals as Record<
      string,
      unknown
    >;

    expect(props.required).toEqual(['a', 'b', 'c']);
    expect(Object.keys(props.properties as object)).toEqual(['a', 'b', 'c']);
  });

  it('forbids unknown signal ids via additionalProperties:false', () => {
    const tool = buildPlanEvalTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const signalsSchema = (schema.properties as Record<string, unknown>).signals as Record<
      string,
      unknown
    >;
    expect(signalsSchema.additionalProperties).toBe(false);
    expect(schema.additionalProperties).toBe(false);
  });

  it('per-signal sub-schema requires reasoning, result, evidence in that order', () => {
    const tool = buildPlanEvalTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const signalsSchema = (schema.properties as Record<string, unknown>).signals as Record<
      string,
      unknown
    >;
    const sub = (signalsSchema.properties as Record<string, unknown>).a as Record<
      string,
      unknown
    >;

    expect(sub.required).toEqual(['reasoning', 'result', 'evidence']);
    expect(Object.keys(sub.properties as object)).toEqual(['reasoning', 'result', 'evidence']);
  });

  it('result is an enum of the four valid values', () => {
    const tool = buildPlanEvalTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const signalsSchema = (schema.properties as Record<string, unknown>).signals as Record<
      string,
      unknown
    >;
    const sub = (signalsSchema.properties as Record<string, unknown>).a as Record<
      string,
      unknown
    >;
    const result = (sub.properties as Record<string, unknown>).result as Record<string, unknown>;

    expect(result.enum).toEqual(['hit', 'partial', 'miss', 'cannot_evaluate']);
  });

  it('top-level requires signals, feedback, top_actions', () => {
    const tool = buildPlanEvalTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(['signals', 'feedback', 'top_actions']);
  });
});
