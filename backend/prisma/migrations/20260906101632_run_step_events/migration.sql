-- CreateTable
CREATE TABLE "RunStepEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunStepEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RunStepEvent_runId_idx" ON "RunStepEvent"("runId");

-- AddForeignKey
ALTER TABLE "RunStepEvent" ADD CONSTRAINT "RunStepEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
