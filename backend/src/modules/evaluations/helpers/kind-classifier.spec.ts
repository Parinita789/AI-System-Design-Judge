import { classifyKind } from './kind-classifier';

describe('classifyKind', () => {
  it('returns traditional_design for a non-agentic design question', () => {
    expect(classifyKind('Design a URL shortener for 10K req/s.')).toBe('traditional_design');
    expect(classifyKind('Design a rate limiter using a token bucket.')).toBe('traditional_design');
  });

  it('returns agentic_design when the prompt mentions AI/LLM/agent vocab', () => {
    expect(classifyKind('Design a chat app with an LLM-based moderation layer.')).toBe('agentic_design');
    expect(classifyKind('Design a customer-support agent with tool use.')).toBe('agentic_design');
    expect(classifyKind('Design a RAG pipeline for product docs.')).toBe('agentic_design');
  });

  it('returns agentic_build when the prompt is buildable AND agentic', () => {
    expect(classifyKind('Build an LLM-powered code review agent in one hour.')).toBe('agentic_build');
    expect(classifyKind('Implement an AI agent that triages GitHub issues.')).toBe('agentic_build');
  });

  it('defaults to traditional_design on ambiguity', () => {
    expect(classifyKind('Build a counter API.')).toBe('traditional_design');
    expect(classifyKind('A short prompt.')).toBe('traditional_design');
  });
});
