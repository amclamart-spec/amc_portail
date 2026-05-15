-- CreateEnum
CREATE TYPE "SchoolYearPeriod" AS ENUM ('MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL');

-- AlterTable
ALTER TABLE "school_years" ADD COLUMN     "period" "SchoolYearPeriod" NOT NULL DEFAULT 'ANNUEL';
