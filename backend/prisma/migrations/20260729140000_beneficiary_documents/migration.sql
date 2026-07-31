-- CreateEnum
CREATE TYPE "SocialBeneficiaryDocumentType" AS ENUM ('IDENTITY_CARD', 'PROOF_OF_ADDRESS', 'HOST_IDENTITY_CARD', 'HOST_PROOF_OF_ADDRESS', 'INCOME_PROOF', 'TAX_NOTICE', 'FAMILY_COMPOSITION_PROOF', 'MISSING_DOCUMENT_ATTESTATION');

-- AlterTable
ALTER TABLE "social_beneficiaries" ADD COLUMN "is_hosted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "social_beneficiaries" ADD COLUMN "host_full_name" TEXT;

-- CreateTable
CREATE TABLE "social_beneficiary_documents" (
    "id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "type" "SocialBeneficiaryDocumentType" NOT NULL,
    "sub_type" TEXT,
    "label" TEXT,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_beneficiary_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_beneficiary_documents_beneficiary_id_type_idx" ON "social_beneficiary_documents"("beneficiary_id", "type");

-- AddForeignKey
ALTER TABLE "social_beneficiary_documents" ADD CONSTRAINT "social_beneficiary_documents_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "social_beneficiaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_beneficiary_documents" ADD CONSTRAINT "social_beneficiary_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
