-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "visualDiffPath" TEXT,
ADD COLUMN     "visualDiffPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "quarantined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quarantinedAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visualBaselinePath" TEXT;
