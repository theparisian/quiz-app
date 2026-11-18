-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `join_token` VARCHAR(32) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `sessions_join_token_key` ON `sessions`(`join_token`);
