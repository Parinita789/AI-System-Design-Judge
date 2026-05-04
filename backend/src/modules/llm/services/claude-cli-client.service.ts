import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import {
  CLAUDE_CLI_DEFAULT_BIN,
  CLAUDE_CLI_TIMEOUT_MS,
  LLM_ENV,
} from '../constants';

export interface ClaudeCliResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Shape of `claude -p --output-format json` stdout. Only the fields we
// actually consume are typed; the CLI emits more (modelUsage,
// inference_geo, iterations, etc.) which we ignore.
interface ClaudeCliJsonEnvelope {
  type: string;
  is_error: boolean;
  result: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
    }
  >;
}

@Injectable()
export class ClaudeCliClientService {
  private readonly logger = new Logger(ClaudeCliClientService.name);

  constructor(private readonly config: ConfigService) {}

  async run(prompt: string, model?: string): Promise<ClaudeCliResult> {
    const bin =
      this.config.get<string>(LLM_ENV.CLAUDE_CLI_BIN) ?? CLAUDE_CLI_DEFAULT_BIN;
    const args = [
      '-p',
      '--output-format',
      'json',
      ...(model ? ['--model', model] : []),
    ];
    this.logger.log(
      `spawn ${bin} ${args.join(' ')} (prompt=${prompt.length} chars)`,
    );

    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, CLAUDE_CLI_TIMEOUT_MS);

      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`claude CLI spawn failed (${bin}): ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(
            new Error(
              `claude CLI timed out after ${CLAUDE_CLI_TIMEOUT_MS}ms (prompt=${prompt.length} chars)`,
            ),
          );
          return;
        }
        if (code !== 0) {
          reject(
            new Error(
              `claude CLI exited with code ${code}: ${stderr.slice(0, 500) || '(empty stderr)'}`,
            ),
          );
          return;
        }

        let envelope: ClaudeCliJsonEnvelope;
        try {
          envelope = JSON.parse(stdout) as ClaudeCliJsonEnvelope;
        } catch (err) {
          reject(
            new Error(
              `claude CLI returned non-JSON stdout: ${(err as Error).message}. ` +
                `First 500 chars: ${stdout.slice(0, 500)}`,
            ),
          );
          return;
        }

        if (envelope.is_error) {
          reject(
            new Error(
              `claude CLI returned an error envelope: ${envelope.result || '(no message)'}`,
            ),
          );
          return;
        }

        const usage = envelope.usage ?? {};
        resolve({
          text: (envelope.result ?? '').trim(),
          model: pickActualModel(envelope.modelUsage, model),
          tokensIn: usage.input_tokens ?? 0,
          tokensOut: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}

// Pick the canonical model id. Prefer the caller's explicit choice;
// otherwise read modelUsage and use the entry that actually produced
// output tokens (Claude Code may briefly invoke Haiku for routing
// before delegating the real work to the requested model). Strip
// suffixes like "[1m]" or "-20251001" so the id matches frontend
// rate-table keys (claude-opus-4-7, claude-haiku-4-5, ...).
function pickActualModel(
  modelUsage: ClaudeCliJsonEnvelope['modelUsage'],
  explicit?: string,
): string {
  if (explicit) return explicit;
  if (!modelUsage) return 'claude-cli';
  let bestKey: string | null = null;
  let bestOut = -1;
  for (const [key, info] of Object.entries(modelUsage)) {
    const out = info?.outputTokens ?? 0;
    if (out > bestOut) {
      bestOut = out;
      bestKey = key;
    }
  }
  if (!bestKey) return 'claude-cli';
  return bestKey.replace(/\[.*?\]$/, '').replace(/-\d{8}$/, '');
}
