-- C2 : programme des salles (5 jeux au plus par salle, contrôlé par l'API).
-- CreateTable
CREATE TABLE `screen_program_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `screen_id` BIGINT NOT NULL,
    `game_id` BIGINT NOT NULL,
    `position` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `screen_program_items_screen_id_idx`(`screen_id`),
    INDEX `screen_program_items_game_id_idx`(`game_id`),
    UNIQUE INDEX `screen_program_items_screen_id_game_id_key`(`screen_id`, `game_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `screen_program_items` ADD CONSTRAINT `screen_program_items_screen_id_fkey` FOREIGN KEY (`screen_id`) REFERENCES `screens`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `screen_program_items` ADD CONSTRAINT `screen_program_items_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

