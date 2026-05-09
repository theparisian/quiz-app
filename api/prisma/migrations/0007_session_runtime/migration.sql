-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `current_question_started_at` DATETIME(3) NULL,
    ADD COLUMN `current_question_paused_at` DATETIME(3) NULL,
    ADD COLUMN `audio_muted` BOOLEAN NOT NULL DEFAULT false;
