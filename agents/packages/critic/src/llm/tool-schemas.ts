import { SEVERITY_VALUES, PRIORITY_VALUES } from '../types';
import { CriticToolSpec } from './llm-client';

// JSON-Schema-ish definitions for the three forced tool_use calls.
// The SDK validates the model's tool_use input against these before
// returning. We re-validate post-parse via validate-refs.ts to catch
// the things JSON Schema can't (line numbers exceeding file length,
// affectedModules pointing at unknown ids).

const issueShape = {
  type: 'object',
  required: ['severity', 'axis', 'fingerprint', 'lines', 'issue'],
  properties: {
    severity: { type: 'string', enum: [...SEVERITY_VALUES] },
    axis: {
      type: 'string',
      description:
        'One of the axis names from the rubric (correctness, error-handling, boundary-safety, observability, testability, api-shape, naming-readability).',
    },
    fingerprint: {
      type: 'string',
      maxLength: 120,
      description:
        'A one-line canonical description of the defect (under 80 chars). Phrase it identically across runs so the same issue gets the same id.',
    },
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'integer', minimum: 1 },
      description: 'Line numbers in the supplied source (1-indexed).',
    },
    issue: { type: 'string', description: 'Full description of the defect.' },
    suggestion: {
      type: 'string',
      description: 'Concrete suggestion, optional.',
    },
  },
};

const concernShape = {
  type: 'object',
  required: ['severity', 'title', 'detail'],
  properties: {
    severity: { type: 'string', enum: [...SEVERITY_VALUES] },
    title: { type: 'string' },
    detail: { type: 'string' },
  },
};

const recommendationShape = {
  type: 'object',
  required: ['priority', 'action'],
  properties: {
    priority: { type: 'string', enum: [...PRIORITY_VALUES] },
    action: { type: 'string' },
  },
};

// ---------- Phase 1: per-file review ----------

export const recordFileReviewTool: CriticToolSpec = {
  name: 'record_file_review',
  description:
    'Record the review of a single source file. Cite issues by 1-indexed line numbers that exist in the supplied source. Tag each issue with an axis from the rubric.',
  inputSchema: {
    type: 'object',
    required: ['file', 'summary', 'strengths', 'concerns', 'issues', 'recommendations'],
    properties: {
      file: {
        type: 'string',
        description: 'The repo-relative path of the file being reviewed.',
      },
      summary: { type: 'string', maxLength: 600 },
      strengths: { type: 'array', maxItems: 6, items: { type: 'string' } },
      concerns: { type: 'array', maxItems: 8, items: concernShape },
      issues: { type: 'array', items: issueShape },
      recommendations: {
        type: 'array',
        maxItems: 5,
        items: recommendationShape,
      },
    },
  },
};

// ---------- Phase 2: module rollup ----------

const moduleIssueShape = {
  type: 'object',
  required: ['severity', 'axis', 'fingerprint', 'file', 'lines', 'issue'],
  properties: {
    severity: { type: 'string', enum: [...SEVERITY_VALUES] },
    axis: { type: 'string' },
    fingerprint: { type: 'string', maxLength: 120 },
    file: {
      type: 'string',
      description:
        'Repo-relative path of the file the issue is in (must match one of the module files supplied).',
    },
    lines: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'integer', minimum: 1 },
    },
    issue: { type: 'string' },
    suggestion: { type: 'string' },
  },
};

const crossFilePatternShape = {
  type: 'object',
  required: ['severity', 'title', 'detail', 'affectedFiles'],
  properties: {
    severity: { type: 'string', enum: [...SEVERITY_VALUES] },
    title: { type: 'string' },
    detail: { type: 'string' },
    affectedFiles: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    },
  },
};

export const recordModuleReviewTool: CriticToolSpec = {
  name: 'record_module_review',
  description:
    'Roll up the per-file reviews into a module-level review. Surface cross-file patterns (issues that recur across multiple files in this module). Carry forward the most important file-level issues with their file references intact.',
  inputSchema: {
    type: 'object',
    required: [
      'module',
      'summary',
      'strengths',
      'concerns',
      'issues',
      'crossFilePatterns',
      'recommendations',
    ],
    properties: {
      module: { type: 'string' },
      summary: { type: 'string', maxLength: 1000 },
      strengths: { type: 'array', maxItems: 8, items: { type: 'string' } },
      concerns: { type: 'array', maxItems: 10, items: concernShape },
      issues: { type: 'array', items: moduleIssueShape },
      crossFilePatterns: {
        type: 'array',
        maxItems: 8,
        items: crossFilePatternShape,
      },
      recommendations: {
        type: 'array',
        maxItems: 6,
        items: recommendationShape,
      },
    },
  },
};

// ---------- Phase 3: global synthesis ----------

const synthesisCrossCuttingShape = {
  type: 'object',
  required: ['severity', 'title', 'detail', 'affectedModules'],
  properties: {
    severity: { type: 'string', enum: [...SEVERITY_VALUES] },
    title: { type: 'string' },
    detail: { type: 'string' },
    affectedModules: {
      type: 'array',
      minItems: 2,
      items: { type: 'string' },
      description:
        'Module ids (must reference modules supplied in the input). Patterns only count if they affect 2+ modules.',
    },
  },
};

const synthesisHighPriorityShape = {
  type: 'object',
  required: ['severity', 'module', 'issue'],
  properties: {
    severity: { type: 'string', enum: [...SEVERITY_VALUES] },
    module: { type: 'string' },
    file: { type: 'string' },
    lines: { type: 'array', items: { type: 'integer', minimum: 1 } },
    issue: { type: 'string' },
  },
};

export const recordSynthesisTool: CriticToolSpec = {
  name: 'record_synthesis',
  description:
    'Produce the overall codebase health summary. Cross-cutting patterns must affect 2+ modules. High-priority items must reference module ids that exist in the supplied module list.',
  inputSchema: {
    type: 'object',
    required: [
      'grade',
      'narrative',
      'topRisks',
      'topStrengths',
      'crossCuttingPatterns',
      'highPriorityItems',
    ],
    properties: {
      grade: { type: 'string', enum: ['A', 'B', 'C', 'D', 'F'] },
      narrative: { type: 'string', maxLength: 2400 },
      topRisks: {
        type: 'array',
        minItems: 3,
        maxItems: 7,
        items: { type: 'string' },
      },
      topStrengths: {
        type: 'array',
        minItems: 3,
        maxItems: 7,
        items: { type: 'string' },
      },
      crossCuttingPatterns: {
        type: 'array',
        items: synthesisCrossCuttingShape,
      },
      highPriorityItems: {
        type: 'array',
        items: synthesisHighPriorityShape,
      },
    },
  },
};
