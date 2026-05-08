import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
} from '@nestjs/common';

const SHUTDOWN_AWAIT_MS = 30_000;

@Injectable()
export class BackgroundTaskTracker implements BeforeApplicationShutdown {
  private readonly logger = new Logger(BackgroundTaskTracker.name);
  private readonly inflight = new Map<number, { label: string; promise: Promise<unknown> }>();
  private nextId = 1;
  private shuttingDown = false;

  track<T>(promise: Promise<T>, label: string): Promise<T | void> {
    if (this.shuttingDown) {
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
