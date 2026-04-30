import { LlmService } from './llm.service';
import { ChatRole } from '../constants';

describe('LlmService', () => {
  let service: LlmService;

  const anthropic = { createMessage: jest.fn() };
  const ollama = { chat: jest.fn() };
  const claudeCli = { run: jest.fn() };

  // Backing store for the mock ConfigService.
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    service = new LlmService(
      anthropic as never,
      ollama as never,
      claudeCli as never,
      config as never,
    );
  });

  // ─── Provider dispatch ────────────────────────────────────────────────

  describe('provider dispatch', () => {
    it('routes to Ollama when OLLAMA_BASE_URL is set', async () => {
      env.OLLAMA_BASE_URL = 'http://host:11434';
      env.OLLAMA_MODEL = 'llama3.1';
      ollama.chat.mockResolvedValue({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'hi' },
        done: true,
      });

      await service.call([{ role: ChatRole.User, content: 'hello' }]);

      expect(ollama.chat).toHaveBeenCalled();
      expect(anthropic.createMessage).not.toHaveBeenCalled();
    });

    it('routes to Claude CLI when LLM_PROVIDER=claude_cli (overrides OLLAMA_BASE_URL)', async () => {
      env.LLM_PROVIDER = 'claude_cli';
      env.OLLAMA_BASE_URL = 'http://host:11434'; // should be ignored
      claudeCli.run.mockResolvedValue({ text: 'hi from cli', model: 'claude-cli' });

      const result = await service.call([{ role: ChatRole.User, content: 'hello' }]);

      expect(claudeCli.run).toHaveBeenCalled();
      expect(ollama.chat).not.toHaveBeenCalled();
      expect(anthropic.createMessage).not.toHaveBeenCalled();
      expect(result.text).toBe('hi from cli');
      expect(result.modelUsed).toBe('claude-cli');
    });

    it('claude_cli flattens system + messages into a single prompt with role labels', async () => {
      env.LLM_PROVIDER = 'claude_cli';
      claudeCli.run.mockResolvedValue({ text: 'r', model: 'claude-cli' });

      await service.call(
        [
          { role: ChatRole.User, content: 'first question' },
          { role: ChatRole.Assistant, content: 'prior answer' },
          { role: ChatRole.User, content: 'follow-up' },
        ],
        { system: 'be terse' },
      );

      const prompt = claudeCli.run.mock.calls[0][0];
      expect(prompt).toContain('be terse');
      expect(prompt).toContain('User: first question');
      expect(prompt).toContain('Assistant: prior answer');
      expect(prompt).toContain('User: follow-up');
    });

    it('routes to Anthropic when OLLAMA_BASE_URL is unset', async () => {
      env.LLM_MODEL = 'claude-opus-4-7';
      env.LLM_MAX_TOKENS = '4096';
      anthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'hi' }],
        model: 'claude-opus-4-7',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await service.call([{ role: ChatRole.User, content: 'hello' }]);

      expect(anthropic.createMessage).toHaveBeenCalled();
      expect(ollama.chat).not.toHaveBeenCalled();
    });
  });

  // ─── Anthropic path ────────────────────────────────────────────────────

  describe('callAnthropic', () => {
    beforeEach(() => {
      env.LLM_MODEL = 'claude-opus-4-7';
      env.LLM_MAX_TOKENS = '4096';
    });

    it('throws if LLM_MODEL env is missing and no override is passed', async () => {
      delete env.LLM_MODEL;
      await expect(
        service.call([{ role: ChatRole.User, content: 'hi' }]),
      ).rejects.toThrow(/LLM_MODEL is not set/);
    });

    it('marks only the last cacheable system block with cache_control', async () => {
      anthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'r' }],
        model: 'claude-opus-4-7',
        usage: { input_tokens: 1, output_tokens: 1 },
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }], {
        system: [
          { text: 'A', cacheable: true },
          { text: 'B', cacheable: true },
          { text: 'C', cacheable: false },
        ],
      });

      const call = anthropic.createMessage.mock.calls[0][0];
      expect(call.system).toEqual([
        { type: 'text', text: 'A' },
        { type: 'text', text: 'B', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'C' },
      ]);
    });

    it('passes a string system through unchanged', async () => {
      anthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'r' }],
        model: 'claude-opus-4-7',
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }], { system: 'plain prompt' });

      expect(anthropic.createMessage.mock.calls[0][0].system).toBe('plain prompt');
    });

    it('extracts text from text blocks and reports usage including cache tokens', async () => {
      anthropic.createMessage.mockResolvedValue({
        content: [
          { type: 'text', text: 'first' },
          { type: 'tool_use', name: 'noop', input: {} },
          { type: 'text', text: 'second' },
        ],
        model: 'claude-opus-4-7',
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 70,
        },
      });

      const result = await service.call([{ role: ChatRole.User, content: 'hi' }]);

      expect(result).toEqual({
        text: 'first\nsecond',
        modelUsed: 'claude-opus-4-7',
        tokensIn: 100,
        tokensOut: 20,
        cacheCreationTokens: 30,
        cacheReadTokens: 70,
      });
    });

    it('defaults cache token fields to 0 when the API omits them', async () => {
      anthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'r' }],
        model: 'claude-opus-4-7',
        usage: { input_tokens: 1, output_tokens: 1 }, // no cache fields
      });

      const result = await service.call([{ role: ChatRole.User, content: 'hi' }]);

      expect(result.cacheCreationTokens).toBe(0);
      expect(result.cacheReadTokens).toBe(0);
    });

    it('respects maxTokens override over the env value', async () => {
      anthropic.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: '' }],
        model: 'claude-opus-4-7',
        usage: { input_tokens: 0, output_tokens: 0 },
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }], { maxTokens: 256 });

      expect(anthropic.createMessage.mock.calls[0][0].max_tokens).toBe(256);
    });
  });

  // ─── Ollama path ───────────────────────────────────────────────────────

  describe('callOllama', () => {
    beforeEach(() => {
      env.OLLAMA_BASE_URL = 'http://host:11434';
      env.OLLAMA_MODEL = 'llama3.1';
    });

    it('prepends a system role message when system is provided', async () => {
      ollama.chat.mockResolvedValue({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'r' },
        done: true,
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }], {
        system: 'be terse',
      });

      const arg = ollama.chat.mock.calls[0][0];
      expect(arg.messages[0]).toEqual({ role: ChatRole.System, content: 'be terse' });
      expect(arg.messages[1]).toEqual({ role: ChatRole.User, content: 'hi' });
    });

    it('flattens an array system into a single concatenated message', async () => {
      ollama.chat.mockResolvedValue({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'r' },
        done: true,
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }], {
        system: [
          { text: 'A', cacheable: true },
          { text: 'B', cacheable: false },
        ],
      });

      expect(ollama.chat.mock.calls[0][0].messages[0]).toEqual({
        role: ChatRole.System,
        content: 'A\n\nB',
      });
    });

    it('omits the system message when no system is provided', async () => {
      ollama.chat.mockResolvedValue({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'r' },
        done: true,
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }]);

      const messages = ollama.chat.mock.calls[0][0].messages;
      expect(messages.find((m: { role: ChatRole }) => m.role === ChatRole.System)).toBeUndefined();
    });

    it('forwards maxTokens as Ollama num_predict option', async () => {
      ollama.chat.mockResolvedValue({
        model: 'llama3.1',
        message: { role: 'assistant', content: '' },
        done: true,
      });

      await service.call([{ role: ChatRole.User, content: 'hi' }], { maxTokens: 512 });

      expect(ollama.chat.mock.calls[0][0].options).toEqual({ num_predict: 512 });
    });

    it('maps Ollama eval counts to tokensIn/tokensOut and zeros cache fields', async () => {
      ollama.chat.mockResolvedValue({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'reply' },
        prompt_eval_count: 50,
        eval_count: 12,
        done: true,
      });

      const result = await service.call([{ role: ChatRole.User, content: 'hi' }]);

      expect(result).toEqual({
        text: 'reply',
        modelUsed: 'llama3.1',
        tokensIn: 50,
        tokensOut: 12,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      });
    });
  });
});
