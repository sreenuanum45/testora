-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('WEB', 'API');

-- CreateEnum
CREATE TYPE "TestCategory" AS ENUM ('SMOKE', 'REGRESSION', 'SANITY', 'E2E');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LocatorStrategy" AS ENUM ('TESTID', 'ROLE', 'LABEL', 'PLACEHOLDER', 'TEXT', 'CSS');

-- CreateEnum
CREATE TYPE "HealMethod" AS ENUM ('HEURISTIC', 'LLM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variable" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "environmentId" TEXT NOT NULL,

    CONSTRAINT "Variable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestModule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "TestModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TestType" NOT NULL DEFAULT 'WEB',
    "category" "TestCategory" NOT NULL DEFAULT 'REGRESSION',
    "projectId" TEXT NOT NULL,
    "moduleId" TEXT,
    "targetUrl" TEXT,
    "recordInIncognito" BOOLEAN NOT NULL DEFAULT true,
    "apiMethod" "HttpMethod",
    "apiEndpoint" TEXT,
    "apiHeaders" JSONB,
    "apiBody" JSONB,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locator" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "strategy" "LocatorStrategy" NOT NULL,
    "value" TEXT NOT NULL,
    "roleName" TEXT,
    "fallbacks" JSONB NOT NULL DEFAULT '[]',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Locator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuiteTest" (
    "suiteId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuiteTest_pkey" PRIMARY KEY ("suiteId","testId")
);

-- CreateTable
CREATE TABLE "Scheduler" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scheduler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "suiteRunId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "tracePath" TEXT,
    "videoPath" TEXT,
    "screenshotPath" TEXT,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuiteRun" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SuiteRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "locatorKey" TEXT NOT NULL,
    "failedStrategy" "LocatorStrategy" NOT NULL,
    "healedStrategy" "LocatorStrategy" NOT NULL,
    "method" "HealMethod" NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_name_key" ON "Project"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_name_key" ON "Environment"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Variable_environmentId_key_key" ON "Variable"("environmentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TestModule_projectId_name_key" ON "TestModule"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Locator_testId_key_key" ON "Locator"("testId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Suite_projectId_name_key" ON "Suite"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Scheduler_suiteId_key" ON "Scheduler"("suiteId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variable" ADD CONSTRAINT "Variable_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestModule" ADD CONSTRAINT "TestModule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Test" ADD CONSTRAINT "Test_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TestModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locator" ADD CONSTRAINT "Locator_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suite" ADD CONSTRAINT "Suite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteTest" ADD CONSTRAINT "SuiteTest_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteTest" ADD CONSTRAINT "SuiteTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scheduler" ADD CONSTRAINT "Scheduler_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_suiteRunId_fkey" FOREIGN KEY ("suiteRunId") REFERENCES "SuiteRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteRun" ADD CONSTRAINT "SuiteRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "Suite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealEvent" ADD CONSTRAINT "HealEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
