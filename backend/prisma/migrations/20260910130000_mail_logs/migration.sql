-- Historique des envois de mailing en masse (espace admin, rubrique Mailing) : une
-- ligne par campagne envoyée (pas par destinataire), pour retrouver qui a reçu quoi
-- et le contenu exact du message.
CREATE TABLE "mail_logs" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "recipient_label" TEXT,
    "recipients" JSONB NOT NULL,
    "recipient_emails" TEXT[],
    "recipient_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "attachment_filename" TEXT,
    "sent_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mail_logs_created_at_idx" ON "mail_logs"("created_at");

ALTER TABLE "mail_logs" ADD CONSTRAINT "mail_logs_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
