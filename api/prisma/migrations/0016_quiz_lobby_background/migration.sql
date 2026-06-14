-- AlterTable
ALTER TABLE `quizzes` ADD COLUMN `lobby_background_media_url` VARCHAR(500) NULL,
    ADD COLUMN `lobby_background_media_type` ENUM('image', 'video') NULL,
    ADD COLUMN `lobby_background_overlay_opacity` INTEGER NOT NULL DEFAULT 0;
