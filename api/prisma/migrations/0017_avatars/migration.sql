-- CreateTable
CREATE TABLE `avatar_libraries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `avatar_libraries_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `avatars` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `library_id` BIGINT NOT NULL,
    `image_url` VARCHAR(500) NOT NULL,
    `image_key` VARCHAR(500) NOT NULL,
    `label` VARCHAR(100) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `avatars_library_id_idx`(`library_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `quizzes` ADD COLUMN `avatars_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `avatar_library_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `players` ADD COLUMN `avatar_id` BIGINT NULL;

-- CreateIndex
CREATE INDEX `quizzes_avatar_library_id_idx` ON `quizzes`(`avatar_library_id`);

-- CreateIndex
CREATE INDEX `players_avatar_id_idx` ON `players`(`avatar_id`);

-- AddForeignKey
ALTER TABLE `quizzes` ADD CONSTRAINT `quizzes_avatar_library_id_fkey` FOREIGN KEY (`avatar_library_id`) REFERENCES `avatar_libraries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avatars` ADD CONSTRAINT `avatars_library_id_fkey` FOREIGN KEY (`library_id`) REFERENCES `avatar_libraries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `players` ADD CONSTRAINT `players_avatar_id_fkey` FOREIGN KEY (`avatar_id`) REFERENCES `avatars`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
