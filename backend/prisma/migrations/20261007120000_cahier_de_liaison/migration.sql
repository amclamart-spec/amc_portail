-- Cahier de liaison (suivi pédagogique, espaces famille et professeur/responsable de
-- pôle) : conversations entre l'équipe pédagogique d'une classe et les familles,
-- collectives (student_id nul) ou individuelles, avec pièce jointe optionnelle.
CREATE TYPE "LiaisonSenderType" AS ENUM ('STAFF', 'FAMILY');

CREATE TABLE "liaison_messages" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "student_id" TEXT,
    "thread_id" TEXT,
    "sender_user_id" TEXT NOT NULL,
    "sender_type" "LiaisonSenderType" NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_label" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "attachment_url" TEXT,
    "attachment_filename" TEXT,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liaison_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liaison_message_reads" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liaison_message_reads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liaison_messages_class_id_last_activity_at_idx" ON "liaison_messages"("class_id", "last_activity_at");
CREATE INDEX "liaison_messages_student_id_idx" ON "liaison_messages"("student_id");
CREATE INDEX "liaison_messages_thread_id_idx" ON "liaison_messages"("thread_id");
CREATE UNIQUE INDEX "liaison_message_reads_message_id_user_id_key" ON "liaison_message_reads"("message_id", "user_id");
CREATE INDEX "liaison_message_reads_user_id_idx" ON "liaison_message_reads"("user_id");

ALTER TABLE "liaison_messages" ADD CONSTRAINT "liaison_messages_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liaison_messages" ADD CONSTRAINT "liaison_messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liaison_messages" ADD CONSTRAINT "liaison_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liaison_messages" ADD CONSTRAINT "liaison_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "liaison_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liaison_message_reads" ADD CONSTRAINT "liaison_message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "liaison_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liaison_message_reads" ADD CONSTRAINT "liaison_message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
