-- AlterEnum
ALTER TYPE "TestType" ADD VALUE 'WEB_API';

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "dataRow" JSONB,
ADD COLUMN     "dataRowIndex" INTEGER;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "dataSetId" TEXT,
ADD COLUMN     "retries" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Component_projectId_name_key" ON "Component"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DataSet_projectId_name_key" ON "DataSet"("projectId", "name");

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSet" ADD CONSTRAINT "DataSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_dataSetId_fkey" FOREIGN KEY ("dataSetId") REFERENCES "DataSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
