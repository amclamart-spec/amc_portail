-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentPlanType' AND e.enumlabel = 'ESPECES'
  ) THEN
    ALTER TYPE "PaymentPlanType" ADD VALUE 'ESPECES';
  END IF;
END$$;
