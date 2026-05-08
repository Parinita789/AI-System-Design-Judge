import { QuestionKind } from '../types/rubric.types';

const AGENTIC_VOCAB = /\b(agent|agents|agentic|llm|llms|ai\s|ai-|tool[\s-]?use|chatbot|copilot|gpt|rag|retrieval[\s-]?augmented)\b/i;

const BUILDABLE_VOCAB = /\b(build|implement|ship|prototype|in\s+(?:1|one)\s*hour|live\s*demo)\b/i;

export function classifyKind(prompt: string): QuestionKind {
  const isAgentic = AGENTIC_VOCAB.test(prompt);
  const isBuildable = BUILDABLE_VOCAB.test(prompt);
  if (isAgentic && isBuildable) return 'agentic_build';
  if (isAgentic) return 'agentic_design';
  return 'traditional_design';
}
