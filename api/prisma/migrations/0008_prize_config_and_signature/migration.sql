-- AlterTable
ALTER TABLE `cinemas` ADD COLUMN `prizes_config` JSON NULL;

-- AlterTable
ALTER TABLE `sponsors` ADD COLUMN `prizes_config` JSON NULL;

-- Existing prize rows (pre-PR7) are incompatible; none expected in rewrite pilots.
DELETE FROM `prizes`;

-- AlterTable
ALTER TABLE `prizes` ADD COLUMN `redeem_code` VARCHAR(32) NOT NULL;
ALTER TABLE `prizes` ADD COLUMN `signature` VARCHAR(128) NOT NULL;
ALTER TABLE `prizes` ADD COLUMN `rank` INTEGER NOT NULL;
ALTER TABLE `prizes` ADD COLUMN `label` VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `prizes_redeem_code_key` ON `prizes`(`redeem_code`);

CREATE INDEX `prizes_redeem_code_idx` ON `prizes`(`redeem_code`);

-- CreateIndex
CREATE UNIQUE INDEX `prizes_player_id_session_id_key` ON `prizes`(`player_id`, `session_id`);
