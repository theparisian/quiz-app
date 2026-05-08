-- AlterTable
ALTER TABLE `ai_generations` ADD COLUMN `input_full` TEXT NULL,
    ADD COLUMN `output_json` JSON NULL,
    ADD COLUMN `error_details` JSON NULL;
