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
}

@Injectable()
export class ClaudeCliClientService {
  private readonly logger = new Logger(ClaudeCliClientService.name);

  constructor(private readonly config: ConfigService) {}

  // Run the local `claude -p` (print mode) CLI with `prompt` piped via stdin.
  // Returns whatever the CLI prints to stdout. The user must already be
  // logged into Claude Code for this to work.
  async run(prompt: string): Promise<ClaudeCliResult> {
    const bin =
      this.config.get<string>(LLM_ENV.CLAUDE_CLI_BIN) ?? CLAUDE_CLI_DEFAULT_BIN;
    this.logger.log(`spawn ${bin} -p (prompt=${prompt.length} chars)`);

    return new Promise((resolve, reject) => {
      const child = spawn(bin, ['-p'], { stdio: ['pipe', 'pipe', 'pipe'] });
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
        resolve({ text: stdout.trim(), model: 'claude-cli' });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
