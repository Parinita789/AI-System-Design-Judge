// Single source of truth for tunables that previously lived as private
// `const FOO = ...` in individual agent files. Each value is overridable
// via env var so ops can tune token caps and truncation thresholds
// without a code change. Reads happen once at module load — there's no
// per-call env lookup on the hot path.

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const AGENTS_CONFIG = {
  planAgent: {
    maxTokens: num('PLAN_AGENT_MAX_TOKENS', 4096),
  },
  buildAgent: {
    maxTokens: num('BUILD_AGENT_MAX_TOKENS', 4096),
  },
  mentorAgent: {
    maxTokens: num('MENTOR_AGENT_MAX_TOKENS', 4096),
  },
  signalMentorAgent: {
    maxTokens: num('SIGNAL_MENTOR_AGENT_MAX_TOKENS', 4096),
  },
  truncation: {
    planMdCapChars: num('PLAN_MD_TRUNCATION_CAP', 50_000),
  },
  buildContext: {
    topKeyFiles: num('BUILD_CONTEXT_TOP_KEY_FILES', 5),
    keyFileMaxChars: num('BUILD_CONTEXT_KEY_FILE_MAX_CHARS', 4000),
  },
} as const;
