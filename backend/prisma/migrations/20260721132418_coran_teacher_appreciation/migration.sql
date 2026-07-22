-- AlterTable
ALTER TABLE "coran_lectures" ADD COLUMN     "appreciation" "CoranAppreciation",
ADD COLUMN     "commentaire_prof" TEXT,
ADD COLUMN     "evaluated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "coran_repetitions" DROP COLUMN "valide",
ADD COLUMN     "appreciation" "CoranAppreciation",
ADD COLUMN     "commentaire_prof" TEXT,
ADD COLUMN     "evaluated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "coran_revisions" ADD COLUMN     "appreciation" "CoranAppreciation",
ADD COLUMN     "commentaire_prof" TEXT,
ADD COLUMN     "evaluated_at" TIMESTAMP(3);

