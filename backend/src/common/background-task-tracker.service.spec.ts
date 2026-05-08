import { BackgroundTaskTracker } from './background-task-tracker.service';

describe('BackgroundTaskTracker', () => {
  let tracker: BackgroundTaskTracker;

  beforeEach(() => {
    tracker = new BackgroundTaskTracker();
  });

  it('registers a promise and decrements size when it settles', async () => {
    let resolve: () => void = () => undefined;
    const p = new Promise<void>((r) => {
      resolve = r;
    });
    tracker.track(p, 'test-task');
    expect(tracker.size()).toBe(1);
    resolve();
    await Promise.resolve();    await Promise.resolve();
    expect(tracker.size()).toBe(0);
  });

  it('catches rejections so unhandled errors do not propagate', async () => {
    const p = Promise.reject(new Error('boom'));
    const tracked = tracker.track(p, 'failing-task');
    await expect(tracked).resolves.toBeUndefined();
  });

  it('beforeApplicationShutdown awaits in-flight tasks before resolving', async () => {
    let resolveTask: () => void = () => undefined;
    const slow = new Promise<void>((r) => {
      resolveTask = r;
    });
    tracker.track(slow, 'slow-task');
    expect(tracker.size()).toBe(1);

    const drainPromise = tracker.beforeApplicationShutdown('SIGTERM');
    let drained = false;
    drainPromise.then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    resolveTask();
    await drainPromise;
    expect(drained).toBe(true);
    expect(tracker.size()).toBe(0);
  });

  it('refuses new tasks once shutdown has begun', async () => {
    await tracker.beforeApplicationShutdown('SIGINT');
    const p = Promise.resolve('value');
    const tracked = tracker.track(p, 'late-task');
    expect(tracker.size()).toBe(0);
    await tracked;
  });
});
