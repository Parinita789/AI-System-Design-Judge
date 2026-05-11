import { EventEmitter } from 'node:events';
import { MapperClaudeCliClient } from './claude-cli-client';

// Stub child_process.spawn return value. Records what was written
// to stdin, lets the test drive stdout/stderr/exit timing.
function makeStubChild() {
  const stdin = { written: '', write(s: string) { stdin.written += s; }, end() {} };
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (signal: string) => void;
  };
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => undefined;
  return child;
}

function fakeSpawner(plan: {
  expectArgs?: (args: string[]) => void;
  stdout: string;
  stderr?: string;
  exitCode?: number;
  errorBeforeExit?: Error;
}) {
  return ((cmd: string, args: readonly string[]) => {
    if (plan.expectArgs) plan.expectArgs(args as string[]);
    const child = makeStubChild();
    queueMicrotask(() => {
      if (plan.errorBeforeExit) {
        child.emit('error', plan.errorBeforeExit);
        return;
      }
      if (plan.stdout) child.stdout.emit('data', Buffer.from(plan.stdout));
      if (plan.stderr) child.stderr.emit('data', Buffer.from(plan.stderr));
      child.emit('close', plan.exitCode ?? 0);
    });
    return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
  }) as unknown as typeof import('node:child_process').spawn;
}

describe('MapperClaudeCliClient', () => {
  it('spawns `claude -p --output-format json --model <m>`, pipes prompt to stdin, parses envelope', async () => {
    let recordedArgs: string[] | null = null;
    const envelope = JSON.stringify({
      type: 'result',
      is_error: false,
      result: 'A short responsibility paragraph.',
      usage: {
        input_tokens: 123,
        output_tokens: 45,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    });
    const client = new MapperClaudeCliClient({
      spawner: fakeSpawner({
        expectArgs: (a) => (recordedArgs = a),
        stdout: envelope,
      }),
    });
    const result = await client.call({
      systemPrompt: 'SYS',
      userPrompt: 'USR',
      model: 'claude-sonnet-4-6',
    });
    expect(recordedArgs).toEqual(['-p', '--output-format', 'json', '--model', 'claude-sonnet-4-6']);
    expect(result.text).toBe('A short responsibility paragraph.');
    expect(result.inputTokens).toBe(123);
    expect(result.outputTokens).toBe(45);
  });

  it('inlines system + "---" + user prompt to stdin', async () => {
    let recordedStdin = '';
    const envelope = JSON.stringify({ is_error: false, result: 'ok', usage: {} });
    const spawner = ((..._args: unknown[]) => {
      const stdin = {
        written: '',
        write(s: string) {
          recordedStdin += s;
        },
        end() {},
      };
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const child = new EventEmitter() as EventEmitter & {
        stdin: typeof stdin;
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: () => void;
      };
      child.stdin = stdin;
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = () => undefined;
      queueMicrotask(() => {
        stdout.emit('data', Buffer.from(envelope));
        child.emit('close', 0);
      });
      return child as unknown as ReturnType<typeof import('node:child_process').spawn>;
    }) as unknown as typeof import('node:child_process').spawn;

    const client = new MapperClaudeCliClient({ spawner });
    await client.call({ systemPrompt: 'sysrules', userPrompt: 'userquestion', model: 'm' });
    expect(recordedStdin).toContain('sysrules');
    expect(recordedStdin).toContain('---');
    expect(recordedStdin).toContain('userquestion');
    expect(recordedStdin.indexOf('sysrules')).toBeLessThan(recordedStdin.indexOf('userquestion'));
  });

  it('rejects when stdout is not JSON', async () => {
    const client = new MapperClaudeCliClient({
      spawner: fakeSpawner({ stdout: '<html>unexpected</html>' }),
    });
    await expect(
      client.call({ systemPrompt: '', userPrompt: 'u', model: 'm' }),
    ).rejects.toThrow(/non-JSON stdout/);
  });

  it('rejects when envelope.is_error is true', async () => {
    const envelope = JSON.stringify({ is_error: true, result: 'rate-limited' });
    const client = new MapperClaudeCliClient({ spawner: fakeSpawner({ stdout: envelope }) });
    await expect(
      client.call({ systemPrompt: '', userPrompt: 'u', model: 'm' }),
    ).rejects.toThrow(/rate-limited/);
  });

  it('rejects when the process exits non-zero', async () => {
    const client = new MapperClaudeCliClient({
      spawner: fakeSpawner({ stdout: '', stderr: 'boom', exitCode: 1 }),
    });
    await expect(
      client.call({ systemPrompt: '', userPrompt: 'u', model: 'm' }),
    ).rejects.toThrow(/exited with code 1.*boom/);
  });

  it('rejects when the spawn itself errors (binary not found)', async () => {
    const client = new MapperClaudeCliClient({
      spawner: fakeSpawner({ stdout: '', errorBeforeExit: new Error('ENOENT') }),
    });
    await expect(
      client.call({ systemPrompt: '', userPrompt: 'u', model: 'm' }),
    ).rejects.toThrow(/spawn failed.*ENOENT/);
  });
});
