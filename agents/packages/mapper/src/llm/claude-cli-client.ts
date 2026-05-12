import { spawn } from 'node:child_process';
import {
  MapperLlmCallParams,
  MapperLlmClient,
  MapperLlmResponse,
  Semaphore,
} from './llm-client';

// Mirrors backend/src/modules/llm/services/claude-cli-client.service.ts:
// spawns `claude -p --output-format json [--model X]`, pipes the
// combined system+user prompt to stdin, parses the JSON envelope.
//
// Why this exists in the mapper: the user's repo .env has no
// ANTHROPIC_API_KEY (the backend itself runs in claude_cli mode).
// Without this client the mapper's --with-llm path is unreachable
// in that setup.
//
// Concurrency: same 3-cap semaphore as MapperAnthropicClient.
// Spawning 50 concurrent `claude` processes would be brutal on
// the user's CPU; 3 keeps wall time bounded without thrashing.

const DEFAULT_BIN = 'claude';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_CONCURRENCY = 3;

interface ClaudeCliEnvelope {
  type?: string;
  is_error?: boolean;
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface ClaudeCliClientOptions {
  bin?: string;
  timeoutMs?: number;
  concurrency?: number;
  // Test seam: lets specs inject a stub spawner without needing
  // a real `claude` binary on PATH.
  spawner?: typeof spawn;
}

export class MapperClaudeCliClient implements MapperLlmClient {
  private readonly bin: string;
  private readonly timeoutMs: number;
  private readonly sem: Semaphore;
  private readonly spawner: typeof spawn;

  constructor(opts: ClaudeCliClientOptions = {}) {
    this.bin = opts.bin ?? process.env.CLAUDE_CLI_BIN ?? DEFAULT_BIN;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sem = new Semaphore(opts.concurrency ?? DEFAULT_CONCURRENCY);
    this.spawner = opts.spawner ?? spawn;
  }

  async call(params: MapperLlmCallParams): Promise<MapperLlmResponse> {
    await this.sem.acquire();
    try {
      // `claude -p` doesn't have a structured system parameter, so
      // we inline the system prompt above the user prompt with a
      // visible separator. Same approach the backend ClaudeCliProvider
      // uses.
      const prompt =
        params.systemPrompt.trim() +
        '\n\n---\n\n' +
        params.userPrompt.trim();

      const args = [
        '-p',
        '--output-format',
        'json',
        ...(params.model ? ['--model', params.model] : []),
      ];

      const envelope = await this.spawnAndCollect(args, prompt);
      const usage = envelope.usage ?? {};
      return {
        text: (envelope.result ?? '').trim(),
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      };
    } finally {
      this.sem.release();
    }
  }

  private spawnAndCollect(args: string[], stdinContent: string): Promise<ClaudeCliEnvelope> {
    return new Promise((resolve, reject) => {
      const child = this.spawner(this.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.timeoutMs);

      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`claude CLI spawn failed (${this.bin}): ${err.message}`));
      });
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(
            new Error(
              `claude CLI timed out after ${this.timeoutMs}ms (prompt=${stdinContent.length} chars)`,
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
        let envelope: ClaudeCliEnvelope;
        try {
          envelope = JSON.parse(stdout) as ClaudeCliEnvelope;
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
        resolve(envelope);
      });

      child.stdin?.write(stdinContent);
      child.stdin?.end();
    });
  }
}
