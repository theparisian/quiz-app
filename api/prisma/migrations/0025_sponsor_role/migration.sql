-- C4 : rôle sponsor (users.sponsor_id) et invitations de contacts sponsor.
-- Une invitation porte soit un cinéma, soit un sponsor : cinema_id devient nullable.
-- AlterTable
ALTER TABLE `invitations` ADD COLUMN `sponsor_id` BIGINT NULL,
    MODIFY `role` ENUM('projectionist', 'cinema_admin', 'sponsor') NOT NULL,
    MODIFY `cinema_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `sponsor_id` BIGINT NULL,
    MODIFY `role` ENUM('player', 'projectionist', 'cinema_admin', 'super_admin', 'sponsor') NOT NULL DEFAULT 'player';

-- CreateIndex
CREATE INDEX `invitations_sponsor_id_idx` ON `invitations`(`sponsor_id`);

-- CreateIndex
CREATE INDEX `users_sponsor_id_idx` ON `users`(`sponsor_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

