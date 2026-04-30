import { OllamaClientService } from './ollama-client.service';
import { ChatRole } from '../constants';

describe('OllamaClientService', () => {
  let service: OllamaClientService;
  const config = { get: jest.fn() };
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as never;
    service = new OllamaClientService(config as never);
  });

  it('throws if OLLAMA_BASE_URL is not set', async () => {
    config.get.mockReturnValue(undefined);
    await expect(
      service.chat({ model: 'llama3.1', messages: [] }),
    ).rejects.toThrow(/OLLAMA_BASE_URL is not set/);
  });

  it('strips trailing slash and POSTs to /api/chat with stream:false', async () => {
    config.get.mockReturnValue('http://host:11434/');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'hi' },
        done: true,
      }),
    });

    await service.chat({
      model: 'llama3.1',
      messages: [{ role: ChatRole.User, content: 'hello' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://host:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream).toBe(false);
    expect(body.model).toBe('llama3.1');
  });

  it('annotates non-2xx responses with the URL and body', async () => {
    config.get.mockReturnValue('http://host:11434');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model "missing" not found',
    });

    await expect(
      service.chat({ model: 'missing', messages: [] }),
    ).rejects.toThrow(/Ollama API error 404.*model "missing" not found/);
  });

  it('annotates network failures with the URL', async () => {
    config.get.mockReturnValue('http://host:11434');
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.chat({ model: 'llama3.1', messages: [] }),
    ).rejects.toThrow(/Ollama request to http:\/\/host:11434\/api\/chat failed: ECONNREFUSED/);
  });

  it('surfaces aborts as a clear timeout error', async () => {
    config.get.mockReturnValue('http://host:11434');
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    fetchMock.mockRejectedValue(abortErr);

    await expect(
      service.chat({ model: 'llama3.1', messages: [] }),
    ).rejects.toThrow(/Ollama request timed out after \d+ms/);
  });
});
