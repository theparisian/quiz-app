-- C3 : campagnes des sponsors, journal des diffusions (deliveries), entrées de séance,
-- preuve d'affichage des manches. Montants en centimes.
-- AlterTable
ALTER TABLE `session_rounds` ADD COLUMN `proof_displayed_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `attendance` INTEGER NULL;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sponsor_id` BIGINT NOT NULL,
    `game_id` BIGINT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `status` ENUM('draft', 'active', 'paused', 'ended') NOT NULL DEFAULT 'draft',
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `pricing` ENUM('per_session', 'per_participant') NOT NULL,
    `unit_price_cents` INTEGER NOT NULL,
    `cinema_share_percent` INTEGER NOT NULL,
    `max_sessions` INTEGER NULL,
    `max_sessions_per_screen_per_day` INTEGER NULL DEFAULT 3,
    `email_sharing_enabled` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaigns_sponsor_id_idx`(`sponsor_id`),
    INDEX `campaigns_game_id_status_idx`(`game_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deliveries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `campaign_id` BIGINT NOT NULL,
    `session_id` BIGINT NOT NULL,
    `round_id` BIGINT NOT NULL,
    `screen_id` BIGINT NOT NULL,
    `cinema_id` BIGINT NOT NULL,
    `played_at` DATETIME(3) NOT NULL,
    `proof_displayed_at` DATETIME(3) NULL,
    `participants` INTEGER NOT NULL,
    `finishers` INTEGER NOT NULL,
    `prizes_issued` INTEGER NOT NULL DEFAULT 0,
    `attendance` INTEGER NULL,
    `billable` BOOLEAN NOT NULL,
    `non_billable_reason` VARCHAR(50) NULL,
    `amount_cents` INTEGER NOT NULL,
    `cinema_share_cents` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `deliveries_round_id_key`(`round_id`),
    INDEX `deliveries_campaign_id_played_at_idx`(`campaign_id`, `played_at`),
    INDEX `deliveries_cinema_id_played_at_idx`(`cinema_id`, `played_at`),
    INDEX `deliveries_session_id_idx`(`session_id`),
    INDEX `deliveries_screen_id_idx`(`screen_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `session_rounds`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_screen_id_fkey` FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliveries` ADD CONSTRAINT `deliveries_cinema_id_fkey` FOREIGN KEY (`cinema_id`) REFERENCES `cinemas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

