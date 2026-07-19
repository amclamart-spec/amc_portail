-- Add new roles to enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'RESPONSABLE_POLE_SOCIAL';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPERATEUR_SOCIAL';

-- Enums Pôle Social
CREATE TYPE "SocialCaseStatus" AS ENUM ('DRAFT','SUBMITTED','ACCEPTED','REFUSED','SUSPENDED','EXPIRED');
CREATE TYPE "StockMovementType" AS ENUM ('COLLECTE','ACHAT','DISTRIBUTION','CORRECTION','RETOUR');
CREATE TYPE "DistributionStatus" AS ENUM ('VALIDATED','CANCELLED');
CREATE TYPE "SocialCollectionStatus" AS ENUM ('DRAFT','VALIDATED','CANCELLED');
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT','VALIDATED','CANCELLED');

-- social_beneficiaries
CREATE TABLE "social_beneficiaries" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "first_name"     TEXT NOT NULL,
  "last_name"      TEXT NOT NULL,
  "email"          TEXT,
  "phone"          TEXT,
  "address_line1"  TEXT,
  "postal_code"    TEXT,
  "city"           TEXT,
  "adults_count"   INTEGER NOT NULL DEFAULT 1,
  "children_count" INTEGER NOT NULL DEFAULT 0,
  "monthly_income" DECIMAL(10,2),
  "observations"   TEXT,
  "created_by"     TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_beneficiaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_beneficiaries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "social_beneficiaries_name_idx" ON "social_beneficiaries"("last_name","first_name");

-- social_cases
CREATE TABLE "social_cases" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "beneficiary_id" TEXT NOT NULL,
  "status"         "SocialCaseStatus" NOT NULL DEFAULT 'DRAFT',
  "auto_decision"  "SocialCaseStatus",
  "auto_score"     JSONB,
  "observations"   TEXT,
  "created_by"     TEXT NOT NULL,
  "processed_by"   TEXT,
  "processed_at"   TIMESTAMP(3),
  "expires_at"     TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_cases_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "social_beneficiaries"("id") ON DELETE CASCADE,
  CONSTRAINT "social_cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "social_cases_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "social_cases_beneficiary_status_idx" ON "social_cases"("beneficiary_id","status");

-- case_decisions
CREATE TABLE "case_decisions" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "case_id"           TEXT NOT NULL,
  "decision"          "SocialCaseStatus" NOT NULL,
  "is_auto"           BOOLEAN NOT NULL DEFAULT false,
  "reason"            TEXT,
  "criteria_snapshot" JSONB,
  "user_id"           TEXT NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "case_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "case_decisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "social_cases"("id") ON DELETE CASCADE,
  CONSTRAINT "case_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "case_decisions_case_id_idx" ON "case_decisions"("case_id");

-- eligibility_criteria
CREATE TABLE "eligibility_criteria" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key"         TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "description" TEXT,
  "type"        TEXT NOT NULL,
  "operator"    TEXT NOT NULL DEFAULT 'LTE',
  "num_value"   DECIMAL(10,2),
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eligibility_criteria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "eligibility_criteria_key_key" UNIQUE ("key")
);

-- social_product_categories
CREATE TABLE "social_product_categories" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_product_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_product_categories_name_key" UNIQUE ("name")
);

-- social_products
CREATE TABLE "social_products" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "category_id"     TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "unit"            TEXT NOT NULL DEFAULT 'unite',
  "stock_qty"       DECIMAL(10,2) NOT NULL DEFAULT 0,
  "alert_threshold" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "social_product_categories"("id") ON DELETE RESTRICT
);
CREATE INDEX "social_products_category_active_idx" ON "social_products"("category_id","is_active");

-- stock_movements
CREATE TABLE "stock_movements" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "product_id"     TEXT NOT NULL,
  "type"           "StockMovementType" NOT NULL,
  "quantity"       DECIMAL(10,2) NOT NULL,
  "unit"           TEXT NOT NULL,
  "reference_id"   TEXT,
  "reference_type" TEXT,
  "comment"        TEXT,
  "user_id"        TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT,
  CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "stock_movements_product_type_idx" ON "stock_movements"("product_id","type");
CREATE INDEX "stock_movements_ref_idx" ON "stock_movements"("reference_id","reference_type");

-- distributions
CREATE TABLE "distributions" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "beneficiary_id" TEXT NOT NULL,
  "case_id"        TEXT,
  "status"         "DistributionStatus" NOT NULL DEFAULT 'VALIDATED',
  "distributed_at" TIMESTAMP(3) NOT NULL,
  "observations"   TEXT,
  "cancelled_at"   TIMESTAMP(3),
  "cancel_reason"  TEXT,
  "user_id"        TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "distributions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "distributions_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "social_beneficiaries"("id") ON DELETE RESTRICT,
  CONSTRAINT "distributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "distributions_beneficiary_status_idx" ON "distributions"("beneficiary_id","status");
CREATE INDEX "distributions_date_idx" ON "distributions"("distributed_at");

-- distribution_lines
CREATE TABLE "distribution_lines" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "distribution_id" TEXT NOT NULL,
  "product_id"      TEXT NOT NULL,
  "quantity"        DECIMAL(10,2) NOT NULL,
  "unit"            TEXT NOT NULL,
  CONSTRAINT "distribution_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "distribution_lines_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distributions"("id") ON DELETE CASCADE,
  CONSTRAINT "distribution_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT
);

-- social_collections
CREATE TABLE "social_collections" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "reference"    TEXT,
  "label"        TEXT NOT NULL,
  "type"         TEXT NOT NULL DEFAULT 'GENERAL',
  "location"     TEXT,
  "status"       "SocialCollectionStatus" NOT NULL DEFAULT 'DRAFT',
  "collected_at" TIMESTAMP(3) NOT NULL,
  "observations" TEXT,
  "user_id"      TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "social_collections_status_date_idx" ON "social_collections"("status","collected_at");

-- collection_lines
CREATE TABLE "collection_lines" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "collection_id" TEXT NOT NULL,
  "product_id"    TEXT NOT NULL,
  "quantity"      DECIMAL(10,2) NOT NULL,
  "unit"          TEXT NOT NULL,
  CONSTRAINT "collection_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collection_lines_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "social_collections"("id") ON DELETE CASCADE,
  CONSTRAINT "collection_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT
);

-- suppliers
CREATE TABLE "suppliers" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"         TEXT NOT NULL,
  "contact"      TEXT,
  "phone"        TEXT,
  "email"        TEXT,
  "address"      TEXT,
  "is_active"    BOOLEAN NOT NULL DEFAULT true,
  "observations" TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- social_budgets
CREATE TABLE "social_budgets" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "year"         INTEGER NOT NULL,
  "total_amount" DECIMAL(10,2) NOT NULL,
  "observations" TEXT,
  "user_id"      TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_budgets_year_key" UNIQUE ("year"),
  CONSTRAINT "social_budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

-- purchases
CREATE TABLE "purchases" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "reference"    TEXT,
  "supplier_id"  TEXT,
  "budget_id"    TEXT,
  "status"       "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "purchased_at" TIMESTAMP(3) NOT NULL,
  "total_amount" DECIMAL(10,2) NOT NULL,
  "description"  TEXT,
  "observations" TEXT,
  "validated_at" TIMESTAMP(3),
  "user_id"      TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL,
  CONSTRAINT "purchases_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "social_budgets"("id") ON DELETE SET NULL,
  CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "purchases_status_date_idx" ON "purchases"("status","purchased_at");

-- purchase_lines
CREATE TABLE "purchase_lines" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "purchase_id" TEXT NOT NULL,
  "product_id"  TEXT NOT NULL,
  "quantity"    DECIMAL(10,2) NOT NULL,
  "unit"        TEXT NOT NULL,
  "unit_price"  DECIMAL(10,2) NOT NULL,
  "total_price" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE,
  CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "social_products"("id") ON DELETE RESTRICT
);

-- Default eligibility criteria
INSERT INTO "eligibility_criteria" ("id","key","label","description","type","operator","num_value","is_active")
VALUES
  (gen_random_uuid()::text,'INCOME_MAX','Revenu mensuel max','Plafond de ressources mensuel du foyer','MONTHLY_INCOME','LTE',1200.00,true),
  (gen_random_uuid()::text,'CHILDREN_MIN','Nombre enfants min','Minimum d enfants a charge','CHILDREN_COUNT','GTE',1,true),
  (gen_random_uuid()::text,'ADULTS_MAX','Adultes max','Nombre maximum d adultes','ADULTS_COUNT','LTE',4,true);

-- Default product categories
INSERT INTO "social_product_categories" ("id","name","description","is_active")
VALUES
  (gen_random_uuid()::text,'Alimentation','Produits alimentaires de base',true),
  (gen_random_uuid()::text,'Hygiene','Produits d hygiene et de soin',true),
  (gen_random_uuid()::text,'Autre','Autres produits d aide',true);
