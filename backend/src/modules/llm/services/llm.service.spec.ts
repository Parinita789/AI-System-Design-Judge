import { LlmService } from './llm.service';
import { ChatRole } from '../constants';

describe('LlmService (facade)', () => {
  it('delegates to whichever provider the factory picks', async () => {
    const fakeProvider = {
      name: 'fake',
      call: jest.fn().mockResolvedValue({
        text: 'pong',
        modelUsed: 'fake-model',
        tokensIn: 1,
        tokensOut: 2,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    };
    const factory = { get: jest.fn().mockReturnValue(fakeProvider) };
    const service = new LlmService(factory as never);

    const result = await service.call([{ role: ChatRole.User, content: 'ping' }], {
      maxTokens: 10,
    });

    expect(factory.get).toHaveBeenCalled();
    expect(fakeProvider.call).toHaveBeenCalledWith(
      [{ role: ChatRole.User, content: 'ping' }],
      { maxTokens: 10 },
    );
    expect(result.text).toBe('pong');
  });

  it('passes an empty options object when none is provided', async () => {
    const fakeProvider = {
      name: 'fake',
      call: jest.fn().mockResolvedValue({
        text: '',
        modelUsed: 'm',
        tokensIn: 0,
        tokensOut: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      }),
    };
    const service = new LlmService({ get: () => fakeProvider } as never);

    await service.call([{ role: ChatRole.User, content: 'hi' }]);

    expect(fakeProvider.call).toHaveBeenCalledWith(
      [{ role: ChatRole.User, content: 'hi' }],
      {},
    );
  });
});
