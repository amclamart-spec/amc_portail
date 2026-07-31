-- DropTable
DROP TABLE "eligibility_criteria";

-- CreateTable
CREATE TABLE "eligibility_settings" (
    "id" TEXT NOT NULL,
    "max_monthly_income" DECIMAL(10,2) NOT NULL,
    "max_household_size" INTEGER NOT NULL,
    "allowed_cities" TEXT[],
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eligibility_settings_pkey" PRIMARY KEY ("id")
);
