-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "parent_session_id" UUID;

-- CreateIndex
CREATE INDEX "sessions_parent_session_id_idx" ON "sessions"("parent_session_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_session_id_fkey" FOREIGN KEY ("parent_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
