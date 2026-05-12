import { spawnSync } from 'node:child_process';
import { MapperLlmClient } from './llm-client';
import { MapperAnthropicClient } from './anthropic-client';
import { MapperClaudeCliClient } from './claude-cli-client';

export type ProviderChoice = 'auto' | 'anthropic' | 'claude-cli';

export interface CreateClientOptions {
  provider: ProviderChoice;
  // Override the binary lookup for `claude` — used by the
  // `auto` autodetect path. Defaults to 'claude'.
  claudeBin?: string;
}

export interface CreatedClient {
  client: MapperLlmClient;
  chosenProvider: 'anthropic' | 'claude-cli';
}

// Provider selection:
//
//   anthropic   — force the Anthropic SDK; requires ANTHROPIC_API_KEY.
//   claude-cli  — force the `claude -p` CLI; requires the binary on PATH.
//   auto        — prefer Anthropic if ANTHROPIC_API_KEY is set;
//                 otherwise fall back to claude-cli if the binary
//                 is on PATH; otherwise throw with a clear message.
//
// `auto` is the default because most users don't want to think about
// it — the mapper "just works" with whichever credential they have.
export function createLlmClient(opts: CreateClientOptions): CreatedClient {
  const provider = opts.provider;
  if (provider === 'anthropic') {
    return { client: new MapperAnthropicClient(), chosenProvider: 'anthropic' };
  }
  if (provider === 'claude-cli') {
    return {
      client: new MapperClaudeCliClient({ bin: opts.claudeBin }),
      chosenProvider: 'claude-cli',
    };
  }
  // auto
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    return { client: new MapperAnthropicClient(), chosenProvider: 'anthropic' };
  }
  if (claudeCliOnPath(opts.claudeBin ?? 'claude')) {
    return {
      client: new MapperClaudeCliClient({ bin: opts.claudeBin }),
      chosenProvider: 'claude-cli',
    };
  }
  throw new Error(
    'No LLM provider available. Either set ANTHROPIC_API_KEY for SDK mode, ' +
      'or ensure the `claude` binary is on PATH for --provider=claude-cli, ' +
      'or pass --no-with-llm for a structural-only run.',
  );
}

function claudeCliOnPath(bin: string): boolean {
  // Use `command -v` (POSIX) to check PATH without invoking the
  // binary. `spawnSync` returns status 0 if found, non-zero
  // otherwise. We swallow any spawn error (Windows etc.) and treat
  // it as "not found" — caller will get the explicit error message.
  try {
    const result = spawnSync('command', ['-v', bin], { stdio: 'pipe', shell: true });
    return result.status === 0 && (result.stdout?.toString().trim().length ?? 0) > 0;
  } catch {
    return false;
  }
}
