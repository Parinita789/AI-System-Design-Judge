export enum ChatRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
}

// Local LLMs on consumer hardware can be slow on long-context calls
// (e.g. evaluation prompts run the full rubric — thousands of tokens).
export const OLLAMA_REQUEST_TIMEOUT_MS = 300_000;

export const LLM_ENV = {
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  LLM_MODEL: 'LLM_MODEL',
  LLM_MAX_TOKENS: 'LLM_MAX_TOKENS',
  OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
  OLLAMA_MODEL: 'OLLAMA_MODEL',
  LLM_PROVIDER: 'LLM_PROVIDER',
  CLAUDE_CLI_BIN: 'CLAUDE_CLI_BIN',
} as const;

// Spawning the local `claude -p` CLI (Claude Code, dev/testing only — uses
// the user's logged-in account, no API key needed).
export const CLAUDE_CLI_TIMEOUT_MS = 600_000; // 10 min — long-context evals are slow
export const CLAUDE_CLI_DEFAULT_BIN = 'claude';
