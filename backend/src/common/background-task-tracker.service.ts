import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
} from '@nestjs/common';

// Wait at most 30s for in-flight background tasks to finish before
// letting the process exit. Long enough for an LLM call (typical ~30s,
// occasional 60s+ — those will be cut, which is acceptable rather than
// blocking shutdown indefinitely). Short enough that orchestrators
// (Docker, systemd) don't escalate to SIGKILL.
const SHUTDOWN_AWAIT_MS = 30_000;

// Tracks fire-and-forget promises so SIGTERM/SIGINT doesn't cut them
// mid-write. Callers wrap their .catch(...) chain with `track(p, label)`
// instead of `void p.catch(...)`. On shutdown the service awaits every
// outstanding promise (with a timeout) before letting Nest tear down
// dependent providers (Prisma, etc.).
//
// Why a separate service instead of inlining: the orchestrator fires
// MentorService.generate, SignalMentorService.generate, and
// OrchestratorService.run from at least three different services
// (build-sessions finish, evaluations re-run, sessions delete). One
// place to register, one place to await, one place to log.
@Injectable()
export class BackgroundTaskTracker implements BeforeApplicationShutdown {
  private readonly logger = new Logger(BackgroundTaskTracker.name);
  private readonly inflight = new Map<number, { label: string; promise: Promise<unknown> }>();
  private nextId = 1;
  private shuttingDown = false;

  // Wrap a promise in tracking + uniform error logging. Caller's own
  // .catch is unnecessary — this method swallows + logs. Returns the
  // tracked promise so callers can still await if they want.
  //
  // Callers that intentionally do NOT want this behavior (e.g., they
  // need to surface the error to the request) should not use track —
  // just await the promise normally.
  track<T>(promise: Promise<T>, label: string): Promise<T | void> {
    if (this.shuttingDown) {
      // Don't accept new work after shutdown begins. Log and let the
      // promise run on its own; if it touches the DB after Prisma
      // disconnects it'll throw, and we can't help that.
      this.logger.warn(
        `Refusing to track new task "${label}" — shutdown in progress.`,
      );
      return promise.catch((err) => {
        this.logger.warn(
          `Background task "${label}" (post-shutdown) failed: ${(err as Error).message}`,
        );
      });
    }
    const id = this.nextId++;
    const wrapped = promise
      .catch((err: unknown) => {
        const message = (err as Error).message ?? String(err);
        this.logger.warn(`Background task "${label}" failed: ${message}`);
      })
      .finally(() => {
        this.inflight.delete(id);
      });
    this.inflight.set(id, { label, promise: wrapped });
    return wrapped;
  }

  size(): number {
    return this.inflight.size;
  }

  // Nest fires this BEFORE onModuleDestroy, so we drain background
  // tasks while Prisma + LLM clients are still alive. If we waited
  // until onApplicationShutdown the DB pool would already be closing
  // and the tasks' final writes would error.
  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.shuttingDown = true;
    const count = this.inflight.size;
    if (count === 0) {
      this.logger.log(
        `Shutdown (${signal ?? 'unknown'}): no in-flight background tasks.`,
      );
      return;
    }
    const labels = [...this.inflight.values()].map((t) => t.label);
    this.logger.log(
      `Shutdown (${signal ?? 'unknown'}): awaiting ${count} background task(s) — ` +
        `${labels.slice(0, 5).join(', ')}${labels.length > 5 ? `, +${labels.length - 5} more` : ''} ` +
        `(timeout ${SHUTDOWN_AWAIT_MS / 1000}s).`,
    );
    const promises = [...this.inflight.values()].map((t) => t.promise);
    const drain = Promise.allSettled(promises);
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timeoutHandle = setTimeout(() => resolve('timeout'), SHUTDOWN_AWAIT_MS);
    });
    const result = await Promise.race([drain, timeout]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (result === 'timeout') {
      const remaining = [...this.inflight.values()].map((t) => t.label);
      this.logger.warn(
        `Shutdown timeout: ${remaining.length} task(s) still in flight after ` +
          `${SHUTDOWN_AWAIT_MS / 1000}s — abandoning. Labels: ${remaining.join(', ')}`,
      );
    } else {
      this.logger.log('Shutdown: all background tasks drained cleanly.');
    }
  }
}
