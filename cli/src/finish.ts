import chalk from 'chalk';
import { EventBuffer } from './buffer';
import { describeError, drainBuffer, MentorApiClient } from './api';
import { readSession } from './config';

const FLUSH_BATCH_SIZE = 100;

export interface FinishOptions {
  server?: string;
}

export async function runFinish(opts: FinishOptions): Promise<number> {
  const session = readSession();
  if (!session) {
    console.error(
      chalk.red('mentor: no session found. Run `mentor watch <token>` first.'),
    );
    return 1;
  }

  const server = opts.server ?? session.server;
  const buffer = new EventBuffer();
  const api = new MentorApiClient({ token: session.token, server });

  const drain = await drainBuffer(api, buffer, FLUSH_BATCH_SIZE);
  if (drain.error) {
    console.warn(
      chalk.yellow(
        `mentor: flush failed — ${drain.flushed} sent, ${drain.remaining} unsent (${drain.error})`,
      ),
    );
  }

  let finishOk = false;
  try {
    await api.finishBuild();
    finishOk = true;
  } catch (err) {
    console.warn(chalk.yellow(`mentor: finish call failed: ${describeError(err)}`));
  }

  const { total, unsent } = buffer.size();
  console.log(
    chalk.cyan(
      `mentor: done · ${total} events · ${drain.flushed} flushed in this call · ${unsent} unsent`,
    ),
  );
  return finishOk && unsent === 0 ? 0 : 1;
}
