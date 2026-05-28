-- CreateTable
CREATE TABLE "refund_security_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "used_by" TEXT,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_security_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_security_codes_code_key" ON "refund_security_codes"("code");

-- AddForeignKey
ALTER TABLE "refund_security_codes" ADD CONSTRAINT "refund_security_codes_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_security_codes" ADD CONSTRAINT "refund_security_codes_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
