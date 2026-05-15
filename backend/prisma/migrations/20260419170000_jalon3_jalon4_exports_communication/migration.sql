-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('ALL_FAMILIES', 'SPECIFIC_CLASS', 'SPECIFIC_FAMILIES');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "email_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "variables" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sent_by" TEXT,
  "sent_at" TIMESTAMP(3),
  "recipient_type" "RecipientType" NOT NULL,
  "recipient_ids" JSONB,
  "status" "MessageStatus" NOT NULL DEFAULT 'DRAFT',
  "delivery_report" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");

-- CreateIndex
CREATE INDEX "messages_sent_at_idx" ON "messages"("sent_at");

-- CreateIndex
CREATE INDEX "messages_recipient_type_idx" ON "messages"("recipient_type");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
