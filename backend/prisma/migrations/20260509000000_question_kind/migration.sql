-- Three-kind taxonomy. Replaces the binary Mode (build|design) with
-- a QuestionKind that names what the question actually is.
CREATE TYPE "QuestionKind" AS ENUM (
  'traditional_design',
  'agentic_design',
  'agentic_build'
);

ALTER TABLE "questions" ADD COLUMN "kind" "QuestionKind";

-- Backfill from the old Mode + a prompt-content heuristic.
-- mode = 'build'  -> agentic_build (build is always agentic now).
-- mode = 'design' + prompt mentions agent/LLM/AI -> agentic_design.
-- anything else                                  -> traditional_design.
UPDATE "questions"
SET "kind" =
  CASE
    WHEN "mode" = 'build' THEN 'agentic_build'::"QuestionKind"
    WHEN "mode" = 'design'
         AND ("prompt" ~* '\m(agent|agents|agentic|llm|llms|ai\s|ai-|tool[\s-]?use|chatbot|copilot|gpt)\M')
      THEN 'agentic_design'::"QuestionKind"
    ELSE 'traditional_design'::"QuestionKind"
  END;

ALTER TABLE "questions" ALTER COLUMN "kind" SET NOT NULL;

ALTER TABLE "questions" DROP COLUMN "mode";

DROP TYPE "Mode";
