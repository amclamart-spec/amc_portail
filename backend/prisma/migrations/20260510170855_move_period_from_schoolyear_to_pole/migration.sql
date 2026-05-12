/*
  Warnings:

  - You are about to drop the column `period` on the `school_years` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "poles" ADD COLUMN     "period" "SchoolYearPeriod" NOT NULL DEFAULT 'ANNUEL';

-- AlterTable
ALTER TABLE "school_years" DROP COLUMN "period";
