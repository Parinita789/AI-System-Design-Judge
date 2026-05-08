import { Injectable, Logger } from '@nestjs/common';
import { BuildEventsRepository } from '../../build-sessions/repositories/build-events.repository';
import { BuildAIInteractionsRepository } from '../../build-sessions/repositories/build-ai-interactions.repository';
import { reconstructBuildTree } from '../helpers/reconstruct-build-tree';
import { selectBuildContext } from '../helpers/select-build-context';
import { BuildContext } from '../types/evaluation.types';

// Pulls captured build artifacts from the dedicated tables, reconstructs
// the final-state tree, and trims to a prompt-shaped slice. Lives outside
// the orchestrator so MentorService and SignalMentorService can produce
// build-aware artifacts without re-implementing the helpers.
@Injectable()
export class BuildContextService {
  private readonly logger = new Logger(BuildContextService.name);

  constructor(
    private readonly buildEventsRepo: BuildEventsRepository,
    private readonly buildAiRepo: BuildAIInteractionsRepository,
  ) {}

  async load(
    sessionId: string,
    session: { buildStartedAt: Date | null; buildEndedAt: Date | null },
  ): Promise<BuildContext> {
    const [eventRows, aiRows] = await Promise.all([
      this.buildEventsRepo.findAllForSession(sessionId),
      this.buildAiRepo.findAllForSession(sessionId),
    ]);

    const reconstructed = reconstructBuildTree(eventRows);
    if (reconstructed.brokenPatchPaths.length > 0) {
      this.logger.warn(
        `Build tree reconstruction had ${reconstructed.brokenPatchPaths.length} broken patch path(s) ` +
          `for session ${sessionId}: ${reconstructed.brokenPatchPaths.join(', ')}`,
      );
    }

    const slimEvents = eventRows.map((e) => ({
      filePath: e.filePath,
      action: e.action as 'created' | 'modified' | 'deleted',
      contentDiff: e.contentDiff,
      occurredAt: e.occurredAt,
    }));

    const { keyFileSnippets, aiTurnsForPrompt } = selectBuildContext({
      events: slimEvents,
      aiTurns: aiRows,
      contents: reconstructed.contents,
    });

    const allFileContents = [...reconstructed.contents.entries()].map(
      ([path, content]) => ({ path, content }),
    );

    return {
      startedAt: session.buildStartedAt,
      endedAt: session.buildEndedAt,
      events: slimEvents,
      finalTree: reconstructed.tree,
      keyFileSnippets,
      allFileContents,
      aiTurns: aiTurnsForPrompt,
    };
  }
}
