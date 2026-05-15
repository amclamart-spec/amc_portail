/*
  Warnings:

  - You are about to drop the column `processed_at` on the `payment_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `processed_at` on the `refunds` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('SANITARY_FORM', 'ENGAGEMENT');

-- CreateEnum
CREATE TYPE "SignatureMode" AS ENUM ('TYPED', 'DRAWN', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "PaymentPlanType" AS ENUM ('STRIPE_CARD', 'GO_CARDLESS_SEPA', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentPlanStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'GOCARDLESS';

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_teacher_user_id_fkey";

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'France';

-- CreateTable
CREATE TABLE "enrollment_drafts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profile" TEXT NOT NULL DEFAULT 'FAMILLE',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_health_forms" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "school_year_id" TEXT,
    "has_chronic_disease" BOOLEAN NOT NULL DEFAULT false,
    "chronic_disease_details" TEXT,
    "has_medical_treatment" BOOLEAN NOT NULL DEFAULT false,
    "medical_treatment_details" TEXT,
    "has_allergy" BOOLEAN NOT NULL DEFAULT false,
    "allergy_details" TEXT,
    "has_disability" BOOLEAN NOT NULL DEFAULT false,
    "disability_details" TEXT,
    "other_useful_health_info" TEXT,
    "can_leave_alone_after_class" BOOLEAN,
    "confidentiality_accepted" BOOLEAN NOT NULL DEFAULT false,
    "no_medication_policy_accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_health_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "health_form_id" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_authorizations" (
    "id" TEXT NOT NULL,
    "health_form_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_consents" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "student_id" TEXT,
    "school_year_id" TEXT,
    "consent_type" "ConsentType" NOT NULL,
    "text_version" TEXT NOT NULL DEFAULT 'v1',
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMP(3),
    "accepted_by_full_name" TEXT NOT NULL,
    "accepted_by_role" TEXT,
    "city_signed" TEXT,
    "signed_at" TIMESTAMP(3),
    "signature_mode" "SignatureMode" NOT NULL DEFAULT 'TYPED',
    "signature_data" TEXT,
    "legal_mention_accepted" BOOLEAN NOT NULL DEFAULT false,
    "legal_mention_label" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "document_snapshot" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "school_year_id" TEXT,
    "payment_id" TEXT,
    "type" "PaymentPlanType" NOT NULL,
    "status" "PaymentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "installments_count" INTEGER NOT NULL DEFAULT 1,
    "schedule_day" INTEGER,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "mandate_id" TEXT,
    "provider_ref" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_configs" (
    "id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "registration_fee" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "arabic_tier_1" DECIMAL(10,2) NOT NULL DEFAULT 310.00,
    "arabic_tier_2" DECIMAL(10,2) NOT NULL DEFAULT 570.00,
    "arabic_tier_3" DECIMAL(10,2) NOT NULL DEFAULT 750.00,
    "arabic_tier_4" DECIMAL(10,2) NOT NULL DEFAULT 900.00,
    "arabic_tier_5" DECIMAL(10,2) NOT NULL DEFAULT 1050.00,
    "arabic_extra_per_student" DECIMAL(10,2) NOT NULL DEFAULT 150.00,
    "coran_enfant" DECIMAL(10,2) NOT NULL DEFAULT 220.00,
    "coran_adulte_homme" DECIMAL(10,2) NOT NULL DEFAULT 300.00,
    "coran_adulte_femme" DECIMAL(10,2) NOT NULL DEFAULT 250.00,
    "sciences_islamiques" DECIMAL(10,2) NOT NULL DEFAULT 300.00,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrollment_drafts_email_idx" ON "enrollment_drafts"("email");

-- CreateIndex
CREATE INDEX "student_health_forms_student_id_school_year_id_idx" ON "student_health_forms"("student_id", "school_year_id");

-- CreateIndex
CREATE INDEX "enrollment_consents_family_id_consent_type_idx" ON "enrollment_consents"("family_id", "consent_type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_payment_id_key" ON "payment_plans"("payment_id");

-- CreateIndex
CREATE INDEX "payment_plans_family_id_status_idx" ON "payment_plans"("family_id", "status");

-- AddForeignKey
ALTER TABLE "student_health_forms" ADD CONSTRAINT "student_health_forms_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_health_forms" ADD CONSTRAINT "student_health_forms_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_health_form_id_fkey" FOREIGN KEY ("health_form_id") REFERENCES "student_health_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_health_form_id_fkey" FOREIGN KEY ("health_form_id") REFERENCES "student_health_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_consents" ADD CONSTRAINT "enrollment_consents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_consents" ADD CONSTRAINT "enrollment_consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_consents" ADD CONSTRAINT "enrollment_consents_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_school_year_id_fkey" FOREIGN KEY ("school_year_id") REFERENCES "school_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
