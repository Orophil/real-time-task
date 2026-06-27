-- CreateEnum
CREATE TYPE "Status" AS ENUM ('todo', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'todo',
    "position" DOUBLE PRECISION NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_status_position_idx" ON "cards"("status", "position");
