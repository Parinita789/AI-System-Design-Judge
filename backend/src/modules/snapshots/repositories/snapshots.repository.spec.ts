import { SnapshotsRepository } from './snapshots.repository';

describe('SnapshotsRepository', () => {
  let repo: SnapshotsRepository;
  const snapshot = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SnapshotsRepository({ snapshot } as never);
  });

  describe('create', () => {
    it('passes through to prisma.snapshot.create', async () => {
      snapshot.create.mockResolvedValue({ id: 'snap-1' });
      const data = {
        sessionId: 'sid-1',
        elapsedMinutes: 5,
        inferredPhase: null,
        artifacts: { planMd: '# Plan', codeFiles: {}, gitLog: null, newJsonlEntries: [] },
      };
      const result = await repo.create(data);

      expect(snapshot.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: 'snap-1' });
    });
  });

  describe('findBySession', () => {
    it('queries by sessionId, newest first', async () => {
      snapshot.findMany.mockResolvedValue([]);
      await repo.findBySession('sid-1');

      expect(snapshot.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sid-1' },
        orderBy: { takenAt: 'desc' },
      });
    });
  });

  describe('findLatest', () => {
    it('returns the newest row for the session', async () => {
      snapshot.findFirst.mockResolvedValue({ id: 'snap-latest' });
      const result = await repo.findLatest('sid-1');

      expect(snapshot.findFirst).toHaveBeenCalledWith({
        where: { sessionId: 'sid-1' },
        orderBy: { takenAt: 'desc' },
      });
      expect(result).toEqual({ id: 'snap-latest' });
    });

    it('returns null when no rows exist', async () => {
      snapshot.findFirst.mockResolvedValue(null);
      expect(await repo.findLatest('sid-1')).toBeNull();
    });
  });

  describe('latestJsonlOffset', () => {
    it('throws — kept stubbed for future iteration', () => {
      expect(() => repo.latestJsonlOffset('sid-1')).toThrow('Not implemented');
    });
  });
});
