-- DropTable
DROP TABLE "eligibility_settings";

-- CreateTable
CREATE TABLE "eligibility_criteria" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "max_monthly_income" DECIMAL(10,2) NOT NULL,
    "max_household_size" INTEGER NOT NULL,
    "allowed_cities" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_criteria_pkey" PRIMARY KEY ("id")
);
