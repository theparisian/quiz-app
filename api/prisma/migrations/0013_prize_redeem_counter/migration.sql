-- AlterTable
ALTER TABLE `cinemas` ADD COLUMN `staff_pin_hash` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `prizes` ADD COLUMN `short_code` VARCHAR(8) NULL;
ALTER TABLE `prizes` ADD COLUMN `expires_at` DATETIME(3) NULL;
ALTER TABLE `prizes` ADD COLUMN `redeemed_via` VARCHAR(10) NULL;

-- Backfill short_code for existing prizes (deterministic from id, unambiguous alphabet)
UPDATE `prizes` SET `short_code` = CONCAT(
  SUBSTRING('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + MOD(`id`, 24), 1),
  SUBSTRING('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + MOD(`id` * 7, 24), 1),
  SUBSTRING('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + MOD(`id` * 13, 24), 1),
  '-',
  SUBSTRING('23456789', 1 + MOD(`id`, 8), 1),
  SUBSTRING('23456789', 1 + MOD(`id` * 3, 8), 1),
  SUBSTRING('23456789', 1 + MOD(`id` * 5, 8), 1)
) WHERE `short_code` IS NULL;

-- Resolve rare collisions by appending id mod digit
UPDATE `prizes` p
INNER JOIN (
  SELECT `short_code`, MIN(`id`) AS keep_id
  FROM `prizes`
  GROUP BY `short_code`
  HAVING COUNT(*) > 1
) dup ON p.`short_code` = dup.`short_code` AND p.`id` <> dup.keep_id
SET p.`short_code` = CONCAT(
  SUBSTRING(p.`short_code`, 1, 3),
  '-',
  SUBSTRING('23456789', 1 + MOD(p.`id`, 8), 1),
  SUBSTRING('23456789', 1 + MOD(p.`id` * 11, 8), 1),
  SUBSTRING('23456789', 1 + MOD(p.`id` * 17, 8), 1)
);

ALTER TABLE `prizes` MODIFY `short_code` VARCHAR(8) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `prizes_short_code_key` ON `prizes`(`short_code`);
CREATE INDEX `prizes_short_code_idx` ON `prizes`(`short_code`);
