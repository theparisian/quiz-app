-- AlterTable
ALTER TABLE `players` ADD COLUMN `joined_question_position` INTEGER NULL,
    ADD COLUMN `pseudo_source` ENUM('SUGGESTED', 'CUSTOM') NOT NULL DEFAULT 'CUSTOM';
