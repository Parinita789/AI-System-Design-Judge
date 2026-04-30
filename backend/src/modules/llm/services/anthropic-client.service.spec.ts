import { AnthropicClientService } from './anthropic-client.service';

// Stub out the SDK so the test doesn't try a real API call.
const sdkCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: sdkCreate },
    })),
  };
});

describe('AnthropicClientService', () => {
  const config = { get: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lazily initializes the SDK on first call (does not crash boot when key missing)', () => {
    config.get.mockReturnValue(undefined);
    const service = new AnthropicClientService(config as never);
    // Construction must not throw — we may be running under Ollama instead.
    expect(service).toBeInstanceOf(AnthropicClientService);
  });

  it('throws a clear error if the env key is missing when actually called', () => {
    config.get.mockReturnValue(undefined);
    const service = new AnthropicClientService(config as never);
    // createMessage is synchronous — getClient() throws before the SDK call returns a Promise.
    expect(() => service.createMessage({} as never)).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('forwards the call to the SDK once the key is configured', async () => {
    config.get.mockReturnValue('sk-test');
    sdkCreate.mockResolvedValue({ id: 'msg_1' });
    const service = new AnthropicClientService(config as never);

    const params = { model: 'claude-opus-4-7', max_tokens: 16, messages: [] };
    const result = await service.createMessage(params as never);

    expect(sdkCreate).toHaveBeenCalledWith(params);
    expect(result).toEqual({ id: 'msg_1' });
  });

  it('reuses the SDK client across calls', async () => {
    config.get.mockReturnValue('sk-test');
    sdkCreate.mockResolvedValue({});
    const service = new AnthropicClientService(config as never);

    await service.createMessage({} as never);
    await service.createMessage({} as never);

    // get() runs once for the first call's lazy init; subsequent calls reuse the cached client.
    expect(config.get).toHaveBeenCalledTimes(1);
  });
});
