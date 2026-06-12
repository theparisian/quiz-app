-- CreateTable
CREATE TABLE `prize_templates` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `cinema_id` BIGINT NULL,
    `sponsor_id` BIGINT NULL,
    `label` VARCHAR(255) NOT NULL,
    `type` ENUM('discount_qr', 'video', 'other') NOT NULL,
    `payload_json` JSON NULL,
    `validity_days` INTEGER NULL,
    `stock` INTEGER NULL,
    `stock_initial` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `prize_templates_cinema_id_idx`(`cinema_id`),
    INDEX `prize_templates_sponsor_id_idx`(`sponsor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prize_templates` ADD CONSTRAINT `prize_templates_cinema_id_fkey` FOREIGN KEY (`cinema_id`) REFERENCES `cinemas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prize_templates` ADD CONSTRAINT `prize_templates_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
