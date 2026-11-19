-- AlterTable
ALTER TABLE `games` ADD COLUMN `audience` ENUM('all_cinemas', 'selected_cinemas') NOT NULL DEFAULT 'all_cinemas',
    ADD COLUMN `catalog_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `min_players` INTEGER NULL,
    ADD COLUMN `rules_text` TEXT NULL,
    ADD COLUMN `tagline` VARCHAR(160) NULL,
    ADD COLUMN `tags` JSON NULL;

-- CreateTable
CREATE TABLE `game_cinema_access` (
    `game_id` BIGINT NOT NULL,
    `cinema_id` BIGINT NOT NULL,

    INDEX `game_cinema_access_cinema_id_idx`(`cinema_id`),
    PRIMARY KEY (`game_id`, `cinema_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `game_cinema_access` ADD CONSTRAINT `game_cinema_access_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `game_cinema_access` ADD CONSTRAINT `game_cinema_access_cinema_id_fkey` FOREIGN KEY (`cinema_id`) REFERENCES `cinemas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Reprise : les jeux déjà publiés restent proposés aux cinémas (catalogue C1).
UPDATE `games` SET `catalog_enabled` = true WHERE `status` = 'published';
