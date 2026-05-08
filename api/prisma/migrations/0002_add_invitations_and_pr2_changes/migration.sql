-- CreateTable
CREATE TABLE `invitations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `role` ENUM('projectionist', 'cinema_admin') NOT NULL,
    `cinema_id` BIGINT NOT NULL,
    `invited_by_user_id` BIGINT NOT NULL,
    `token` VARCHAR(100) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `status` ENUM('pending', 'accepted', 'revoked', 'expired') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `accepted_at` DATETIME(3) NULL,

    UNIQUE INDEX `invitations_token_key`(`token`),
    INDEX `invitations_cinema_id_idx`(`cinema_id`),
    INDEX `invitations_invited_by_user_id_idx`(`invited_by_user_id`),
    INDEX `invitations_token_idx`(`token`),
    INDEX `invitations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `users_magic_link_token_idx` ON `users`(`magic_link_token`);

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_cinema_id_fkey` FOREIGN KEY (`cinema_id`) REFERENCES `cinemas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invited_by_user_id_fkey` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
