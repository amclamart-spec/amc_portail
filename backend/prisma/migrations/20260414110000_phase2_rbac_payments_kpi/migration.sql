-- Phase 2: RBAC 5 profils, paiements avancés, KPI financiers

-- ===== Role enum migration =====
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TRESORIER', 'PROFESSEUR', 'FAMILLE');

ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role"
  USING (
    CASE
      WHEN "role"::text = 'RESPONSABLE_FAMILLE' THEN 'FAMILLE'::"Role"
      WHEN "role"::text = 'ELEVE' THEN 'FAMILLE'::"Role"
      ELSE "role"::text::"Role"
    END
  ),
  ALTER COLUMN "role" SET DEFAULT 'FAMILLE';

DROP TYPE "Role_old";

-- ===== PaymentMethod enum migration =====
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'PAYPAL', 'CHEQUE', 'ESPECES', 'VIREMENT', 'CB', 'SEPA');
ALTER TABLE "payments"
  ALTER COLUMN "payment_method" TYPE "PaymentMethod"
  USING (
    CASE
      WHEN "payment_method" IS NULL THEN NULL
      ELSE "payment_method"::text::"PaymentMethod"
    END
  );
DROP TYPE "PaymentMethod_old";

-- ===== PaymentStatus enum migration =====
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED', 'OVERDUE', 'FAILED', 'REFUNDED', 'CANCELLED');
ALTER TABLE "payments"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PaymentStatus"
  USING "status"::text::"PaymentStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "PaymentStatus_old";

-- ===== New enums =====
CREATE TYPE "PaymentProvider" AS ENUM ('OFFLINE', 'STRIPE', 'PAYPAL');
CREATE TYPE "TransactionType" AS ENUM ('PAYMENT', 'REFUND');
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED');
CREATE TYPE "FinancialEntryType" AS ENUM ('INCOME', 'EXPENSE');

-- ===== Existing table alterations =====
ALTER TABLE "classes" ADD COLUMN "teacher_user_id" TEXT;
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD COLUMN "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN "external_payment_id" TEXT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR',
  ADD COLUMN "metadata" JSONB;

-- ===== New tables =====
CREATE TABLE "payment_transactions" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "type" "TransactionType" NOT NULL DEFAULT 'PAYMENT',
  "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "external_ref" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "recorded_by_id" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "transaction_id" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "requested_by" TEXT,
  "approved_by_id" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "FinancialEntryType" NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financial_entries" (
  "id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "entry_type" "FinancialEntryType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "description" TEXT,
  "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "school_year_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financial_categories_name_key" ON "financial_categories"("name");

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_entries" ADD CONSTRAINT "financial_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
