-- C5 : lots à codes (mode de retrait, codes fournis par la marque) et consentements email
-- (contacts, consentements par périmètre, accord de partage avec un cinéma).
-- AlterTable
ALTER TABLE `cinemas` ADD COLUMN `email_sharing_enabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `prize_templates` ADD COLUMN `redeem_instructions` TEXT NULL,
    ADD COLUMN `redeem_mode` ENUM('staff_pin', 'code_pool', 'static_code') NOT NULL DEFAULT 'staff_pin',
    ADD COLUMN `redeem_url` VARCHAR(500) NULL,
    ADD COLUMN `static_code` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `prize_codes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `template_id` BIGINT NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `prize_id` BIGINT NULL,
    `assigned_at` DATETIME(3) NULL,

    UNIQUE INDEX `prize_codes_prize_id_key`(`prize_id`),
    INDEX `prize_codes_template_id_prize_id_idx`(`template_id`, `prize_id`),
    UNIQUE INDEX `prize_codes_template_id_code_key`(`template_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contacts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unsubscribed_all_at` DATETIME(3) NULL,

    UNIQUE INDEX `contacts_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_consents` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `contact_id` BIGINT NOT NULL,
    `scope` ENUM('platform', 'cinema', 'sponsor') NOT NULL,
    `cinema_id` BIGINT NULL,
    `sponsor_id` BIGINT NULL,
    `session_id` BIGINT NOT NULL,
    `granted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `wording_version` VARCHAR(20) NOT NULL,

    INDEX `contact_consents_scope_cinema_id_idx`(`scope`, `cinema_id`),
    INDEX `contact_consents_scope_sponsor_id_idx`(`scope`, `sponsor_id`),
    INDEX `contact_consents_cinema_id_idx`(`cinema_id`),
    INDEX `contact_consents_sponsor_id_idx`(`sponsor_id`),
    INDEX `contact_consents_session_id_idx`(`session_id`),
    UNIQUE INDEX `contact_consents_contact_id_scope_cinema_id_sponsor_id_key`(`contact_id`, `scope`, `cinema_id`, `sponsor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prize_codes` ADD CONSTRAINT `prize_codes_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `prize_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prize_codes` ADD CONSTRAINT `prize_codes_prize_id_fkey` FOREIGN KEY (`prize_id`) REFERENCES `prizes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_consents` ADD CONSTRAINT `contact_consents_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_consents` ADD CONSTRAINT `contact_consents_cinema_id_fkey` FOREIGN KEY (`cinema_id`) REFERENCES `cinemas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_consents` ADD CONSTRAINT `contact_consents_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_consents` ADD CONSTRAINT `contact_consents_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

