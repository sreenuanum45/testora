-- AlterTable
ALTER TABLE "Locator" ADD COLUMN     "sourceRoleName" TEXT,
ADD COLUMN     "sourceStrategy" "LocatorStrategy",
ADD COLUMN     "sourceValue" TEXT;
