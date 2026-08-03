-- CreateTable
CREATE TABLE `sound_libraries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sound_libraries_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sounds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `library_id` BIGINT NULL,
    `quiz_id` BIGINT NULL,
    `kind` ENUM('music', 'sfx') NOT NULL DEFAULT 'sfx',
    `audio_url` VARCHAR(500) NOT NULL,
    `audio_key` VARCHAR(500) NOT NULL,
    `label` VARCHAR(150) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sounds_library_id_idx`(`library_id`),
    INDEX `sounds_quiz_id_idx`(`quiz_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `quizzes` ADD COLUMN `audio_config` JSON NULL;

-- AddForeignKey
ALTER TABLE `sounds` ADD CONSTRAINT `sounds_library_id_fkey` FOREIGN KEY (`library_id`) REFERENCES `sound_libraries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sounds` ADD CONSTRAINT `sounds_quiz_id_fkey` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
