import { spawnSync } from 'node:child_process';
import { CriticLlmClient } from './llm-client';
import { CriticAnthropicClient } from './anthropic-client';
import { CriticClaudeCliClient } from './claude-cli-client';

export type ProviderChoice = 'auto' | 'anthropic' | 'claude-cli';

export interface CreateClientOptions {
  provider: ProviderChoice;
  claudeBin?: string;
}

export interface CreatedClient {
  client: CriticLlmClient;
  chosenProvider: 'anthropic' | 'claude-cli';
}

// Provider selection mirrors the mapper:
//
//   anthropic   force SDK; requires ANTHROPIC_API_KEY.
//   claude-cli  force the `claude -p` CLI; requires the binary on PATH.
//   auto        prefer SDK if ANTHROPIC_API_KEY is set; else CLI if
//               binary is on PATH; else throw.
export function createLlmClient(opts: CreateClientOptions): CreatedClient {
  const provider = opts.provider;
  if (provider === 'anthropic') {
    return { client: new CriticAnthropicClient(), chosenProvider: 'anthropic' };
  }
  if (provider === 'claude-cli') {
    return {
      client: new CriticClaudeCliClient({ bin: opts.claudeBin }),
      chosenProvider: 'claude-cli',
    };
  }
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    return { client: new CriticAnthropicClient(), chosenProvider: 'anthropic' };
  }
  if (claudeCliOnPath(opts.claudeBin ?? 'claude')) {
    return {
      client: new CriticClaudeCliClient({ bin: opts.claudeBin }),
      chosenProvider: 'claude-cli',
    };
  }
  throw new Error(
    'No LLM provider available. Either set ANTHROPIC_API_KEY for SDK mode, ' +
      'or ensure the `claude` binary is on PATH for --provider=claude-cli.',
  );
}

function claudeCliOnPath(bin: string): boolean {
  try {
    const result = spawnSync('command', ['-v', bin], { stdio: 'pipe', shell: true });
    return result.status === 0 && (result.stdout?.toString().trim().length ?? 0) > 0;
  } catch {
    return false;
  }
}
