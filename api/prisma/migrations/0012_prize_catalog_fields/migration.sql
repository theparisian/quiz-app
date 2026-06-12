-- AlterTable
ALTER TABLE `quizzes` ADD COLUMN `prizes_config` JSON NULL;

-- AlterTable
ALTER TABLE `cinemas` ADD COLUMN `super_prize_config` JSON NULL;

-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `super_prize_template_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `prizes` ADD COLUMN `prize_template_id` BIGINT NULL;

-- CreateIndex
CREATE INDEX `sessions_super_prize_template_id_idx` ON `sessions`(`super_prize_template_id`);

-- CreateIndex
CREATE INDEX `prizes_prize_template_id_idx` ON `prizes`(`prize_template_id`);

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_super_prize_template_id_fkey` FOREIGN KEY (`super_prize_template_id`) REFERENCES `prize_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prizes` ADD CONSTRAINT `prizes_prize_template_id_fkey` FOREIGN KEY (`prize_template_id`) REFERENCES `prize_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
