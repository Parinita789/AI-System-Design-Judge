// Single source of truth for tunables that previously lived as private
// `const FOO = ...` in individual agent files. Each value is overridable
// via env var so ops can tune token caps and truncation thresholds
// without a code change. Reads happen once at module load — there's no
// per-call env lookup on the hot path.
//
// Model selection precedence (highest to lowest):
//   1. The per-call `input.model` (e.g. an explicit override on the
//      Re-evaluate request body) — chosen by the user, so always wins.
//   2. The agent-specific env (PLAN_AGENT_MODEL, BUILD_AGENT_MODEL,
//      MENTOR_AGENT_MODEL, SIGNAL_MENTOR_AGENT_MODEL) — lets ops route
//      different stages to different models (e.g. Opus for Plan,
//      Sonnet for Mentor) without a code change.
//   3. The global LLM_MODEL env — same default for every agent.
//   4. The compile-time default `claude-opus-4-7`.
// Resolved once at boot; env mutations after start are not picked up.

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const str = (key: string, fallback: string): string => {
  const raw = process.env[key];
  return raw && raw.trim() ? raw : fallback;
};

const COMPILE_DEFAULT_MODEL = 'claude-opus-4-7';
const GLOBAL_MODEL = str('LLM_MODEL', COMPILE_DEFAULT_MODEL);

export const AGENTS_CONFIG = {
  planAgent: {
    maxTokens: num('PLAN_AGENT_MAX_TOKENS', 4096),
    defaultModel: str('PLAN_AGENT_MODEL', GLOBAL_MODEL),
  },
  buildAgent: {
    maxTokens: num('BUILD_AGENT_MAX_TOKENS', 4096),
    defaultModel: str('BUILD_AGENT_MODEL', GLOBAL_MODEL),
  },
  mentorAgent: {
    maxTokens: num('MENTOR_AGENT_MAX_TOKENS', 4096),
    defaultModel: str('MENTOR_AGENT_MODEL', GLOBAL_MODEL),
  },
  signalMentorAgent: {
    maxTokens: num('SIGNAL_MENTOR_AGENT_MAX_TOKENS', 4096),
    defaultModel: str('SIGNAL_MENTOR_AGENT_MODEL', GLOBAL_MODEL),
  },
  truncation: {
    planMdCapChars: num('PLAN_MD_TRUNCATION_CAP', 50_000),
  },
  buildContext: {
    topKeyFiles: num('BUILD_CONTEXT_TOP_KEY_FILES', 5),
    keyFileMaxChars: num('BUILD_CONTEXT_KEY_FILE_MAX_CHARS', 4000),
  },
} as const;
