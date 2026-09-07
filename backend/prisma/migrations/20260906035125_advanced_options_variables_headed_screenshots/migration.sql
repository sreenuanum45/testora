-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "headed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "environmentId" TEXT,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "viewportHeight" INTEGER,
ADD COLUMN     "viewportWidth" INTEGER;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
