import { ModuleSummary } from '../types';
import { selectKeyFiles } from '../scan/select-key-files';
import { DiscoveredModule } from '../types';
import { MapperLlmClient, MapperLlmResponse } from './llm-client';
import {
  buildSystemPrompt,
  buildUserPrompt,
  findHallucinatedCitations,
} from './responsibility-prompt';

const INSUFFICIENT_SIGNAL = 'Insufficient signal.';

export interface SynthesizeRequest {
  module: DiscoveredModule;
  summary: Pick<
    ModuleSummary,
    'id' | 'path' | 'fileCount' | 'exports' | 'internalDepsOut' | 'externalDeps'
  >;
}

export interface SynthesizeResult {
  responsibility?: string;
  unverifiedCitation?: boolean;
  synthesisError?: string;
  usage?: MapperLlmResponse;
}

// Per-module call: build prompts, call client, enforce citation,
// retry once on hallucination, mark un-verifiable as unverified
// rather than discarding (preserves debuggability).
export async function synthesizeOne(
  client: MapperLlmClient,
  model: string,
  request: SynthesizeRequest,
): Promise<SynthesizeResult> {
  const keyFiles = selectKeyFiles(request.module);
  const userPrompt = buildUserPrompt({
    moduleId: request.summary.id,
    modulePath: request.summary.path,
    fileCount: request.summary.fileCount,
    exports: request.summary.exports,
    internalDepsOut: request.summary.internalDepsOut,
    externalDeps: request.summary.externalDeps,
    keyFiles,
  });

  let response: MapperLlmResponse;
  try {
    response = await client.call({
      systemPrompt: buildSystemPrompt(),
      userPrompt,
      model,
    });
  } catch (err) {
    return {
      synthesisError: err instanceof Error ? err.message : String(err),
    };
  }

  const text = response.text.trim();
  if (text === INSUFFICIENT_SIGNAL) {
    // Treat as "no responsibility known" — leave responsibility
    // undefined, no error. Renderer will simply skip the line.
    return { usage: response };
  }

  const hallucinated = findHallucinatedCitations(text, keyFiles);
  if (hallucinated.length === 0) {
    return { responsibility: text, usage: response };
  }

  // One retry, with a corrective addendum.
  const retryPrompt =
    userPrompt +
    `\n\n[NOTE: your previous response cited ${hallucinated
      .map((c) => `\`${c}\``)
      .join(', ')}, which is/are NOT in the Key files list. Cite only files supplied above.]`;

  let retryResponse: MapperLlmResponse;
  try {
    retryResponse = await client.call({
      systemPrompt: buildSystemPrompt(),
      userPrompt: retryPrompt,
      model,
    });
  } catch (err) {
    return {
      responsibility: text,
      unverifiedCitation: true,
      synthesisError:
        'retry failed: ' + (err instanceof Error ? err.message : String(err)),
      usage: response,
    };
  }

  const retryText = retryResponse.text.trim();
  const retryHallucinated = findHallucinatedCitations(retryText, keyFiles);
  if (retryHallucinated.length === 0) {
    return { responsibility: retryText, usage: retryResponse };
  }
  // Two strikes — emit anyway with the unverified marker so the
  // user can see what the model said and judge.
  return {
    responsibility: retryText,
    unverifiedCitation: true,
    usage: retryResponse,
  };
}
