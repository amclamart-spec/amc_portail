-- CreateEnum
CREATE TYPE "CoranAppreciation" AS ENUM ('TRES_BIEN', 'BIEN', 'A_REVOIR');

-- CreateEnum
CREATE TYPE "CoranRevisionType" AS ENUM ('NOUVELLE_PAGE', 'ANCIENNE_PAGE');

-- DropForeignKey
ALTER TABLE "case_decisions" DROP CONSTRAINT "case_decisions_case_id_fkey";

-- DropForeignKey
ALTER TABLE "case_decisions" DROP CONSTRAINT "case_decisions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "collection_lines" DROP CONSTRAINT "collection_lines_collection_id_fkey";

-- DropForeignKey
ALTER TABLE "collection_lines" DROP CONSTRAINT "collection_lines_product_id_fkey";

-- DropForeignKey
ALTER TABLE "distribution_lines" DROP CONSTRAINT "distribution_lines_distribution_id_fkey";

-- DropForeignKey
ALTER TABLE "distribution_lines" DROP CONSTRAINT "distribution_lines_product_id_fkey";

-- DropForeignKey
ALTER TABLE "distributions" DROP CONSTRAINT "distributions_beneficiary_id_fkey";

-- DropForeignKey
ALTER TABLE "distributions" DROP CONSTRAINT "distributions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_product_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_purchase_id_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_user_id_fkey";

-- DropForeignKey
ALTER TABLE "social_beneficiaries" DROP CONSTRAINT "social_beneficiaries_created_by_fkey";

-- DropForeignKey
ALTER TABLE "social_budgets" DROP CONSTRAINT "social_budgets_user_id_fkey";

-- DropForeignKey
ALTER TABLE "social_cases" DROP CONSTRAINT "social_cases_beneficiary_id_fkey";

-- DropForeignKey
ALTER TABLE "social_cases" DROP CONSTRAINT "social_cases_created_by_fkey";

-- DropForeignKey
ALTER TABLE "social_cases" DROP CONSTRAINT "social_cases_processed_by_fkey";

-- DropForeignKey
ALTER TABLE "social_collections" DROP CONSTRAINT "social_collections_user_id_fkey";

-- DropForeignKey
ALTER TABLE "social_products" DROP CONSTRAINT "social_products_category_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_product_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_user_id_fkey";

-- AlterTable
ALTER TABLE "case_decisions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "collection_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "distribution_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "distributions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "eligibility_criteria" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_beneficiaries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_budgets" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_cases" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_collections" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_product_categories" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_products" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "unit" SET DEFAULT 'unité',
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "stock_movements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "suppliers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "sourates_coran" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nom_arabe" TEXT NOT NULL,
    "nom_fr" TEXT NOT NULL,
    "nombre_versets" INTEGER NOT NULL,
    "nombre_pages" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sourates_coran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coran_seances" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "sourate_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "page_debut" INTEGER NOT NULL,
    "page_fin" INTEGER NOT NULL,
    "note_memorisation" "CoranAppreciation",
    "note_revision_nouvelle" "CoranAppreciation",
    "note_revision_ancienne" "CoranAppreciation",
    "note_tajwid" "CoranAppreciation",
    "commentaire" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coran_seances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coran_revisions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "sourate_id" TEXT NOT NULL,
    "page_debut" INTEGER NOT NULL,
    "page_fin" INTEGER NOT NULL,
    "type" "CoranRevisionType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coran_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coran_repetitions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "numero_page" INTEGER NOT NULL,
    "sourate_id" TEXT,
    "compteur" INTEGER NOT NULL DEFAULT 0,
    "derniere_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coran_repetitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coran_lectures" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "sourate_id" TEXT NOT NULL,
    "page_debut" INTEGER NOT NULL,
    "page_fin" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duree_minutes" INTEGER,
    "commentaire" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coran_lectures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sourates_coran_numero_key" ON "sourates_coran"("numero");

-- CreateIndex
CREATE INDEX "coran_seances_student_id_date_idx" ON "coran_seances"("student_id", "date");

-- CreateIndex
CREATE INDEX "coran_seances_class_id_idx" ON "coran_seances"("class_id");

-- CreateIndex
CREATE INDEX "coran_revisions_student_id_date_idx" ON "coran_revisions"("student_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "coran_repetitions_student_id_numero_page_key" ON "coran_repetitions"("student_id", "numero_page");

-- CreateIndex
CREATE INDEX "coran_lectures_student_id_date_idx" ON "coran_lectures"("student_id", "date");

-- AddForeignKey
ALTER TABLE "social_beneficiaries" ADD CONSTRAINT "social_beneficiaries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_cases" ADD CONSTRAINT "social_cases_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "social_beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_cases" ADD CONSTRAINT "social_cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_cases" ADD CONSTRAINT "social_cases_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_decisions" ADD CONSTRAINT "case_decisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "social_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_decisions" ADD CONSTRAINT "case_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_products" ADD CONSTRAINT "social_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "social_product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "social_beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_lines" ADD CONSTRAINT "distribution_lines_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_lines" ADD CONSTRAINT "distribution_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_collections" ADD CONSTRAINT "social_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_lines" ADD CONSTRAINT "collection_lines_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "social_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_lines" ADD CONSTRAINT "collection_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "social_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_budgets" ADD CONSTRAINT "social_budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_seances" ADD CONSTRAINT "coran_seances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_seances" ADD CONSTRAINT "coran_seances_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_seances" ADD CONSTRAINT "coran_seances_sourate_id_fkey" FOREIGN KEY ("sourate_id") REFERENCES "sourates_coran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_revisions" ADD CONSTRAINT "coran_revisions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_revisions" ADD CONSTRAINT "coran_revisions_sourate_id_fkey" FOREIGN KEY ("sourate_id") REFERENCES "sourates_coran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_repetitions" ADD CONSTRAINT "coran_repetitions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_repetitions" ADD CONSTRAINT "coran_repetitions_sourate_id_fkey" FOREIGN KEY ("sourate_id") REFERENCES "sourates_coran"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_lectures" ADD CONSTRAINT "coran_lectures_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coran_lectures" ADD CONSTRAINT "coran_lectures_sourate_id_fkey" FOREIGN KEY ("sourate_id") REFERENCES "sourates_coran"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "distributions_beneficiary_status_idx" RENAME TO "distributions_beneficiary_id_status_idx";

-- RenameIndex
ALTER INDEX "distributions_date_idx" RENAME TO "distributions_distributed_at_idx";

-- RenameIndex
ALTER INDEX "purchases_status_date_idx" RENAME TO "purchases_status_purchased_at_idx";

-- RenameIndex
ALTER INDEX "social_beneficiaries_name_idx" RENAME TO "social_beneficiaries_last_name_first_name_idx";

-- RenameIndex
ALTER INDEX "social_cases_beneficiary_status_idx" RENAME TO "social_cases_beneficiary_id_status_idx";

-- RenameIndex
ALTER INDEX "social_collections_status_date_idx" RENAME TO "social_collections_status_collected_at_idx";

-- RenameIndex
ALTER INDEX "social_products_category_active_idx" RENAME TO "social_products_category_id_is_active_idx";

-- RenameIndex
ALTER INDEX "stock_movements_product_type_idx" RENAME TO "stock_movements_product_id_type_idx";

-- RenameIndex
ALTER INDEX "stock_movements_ref_idx" RENAME TO "stock_movements_reference_id_reference_type_idx";
