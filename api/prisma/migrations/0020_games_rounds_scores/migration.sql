-- CreateTable
CREATE TABLE `games` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `engine_key` VARCHAR(50) NOT NULL,
    `config_json` JSON NULL,
    `quiz_id` BIGINT NULL,
    `kind` ENUM('internal', 'sponsored') NOT NULL DEFAULT 'internal',
    `sponsor_id` BIGINT NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `cover_image_url` VARCHAR(500) NULL,
    `duration_estimate_seconds` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `games_slug_key`(`slug`),
    UNIQUE INDEX `games_quiz_id_key`(`quiz_id`),
    INDEX `games_sponsor_id_idx`(`sponsor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_rounds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `session_id` BIGINT NOT NULL,
    `position` INTEGER NOT NULL,
    `game_id` BIGINT NOT NULL,
    `state` ENUM('pending', 'running', 'ended', 'skipped') NOT NULL DEFAULT 'pending',
    `started_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `state_json` JSON NULL,

    INDEX `session_rounds_session_id_idx`(`session_id`),
    INDEX `session_rounds_game_id_idx`(`game_id`),
    UNIQUE INDEX `session_rounds_session_id_position_key`(`session_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `score_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `session_id` BIGINT NOT NULL,
    `round_id` BIGINT NOT NULL,
    `player_id` BIGINT NOT NULL,
    `points` INTEGER NOT NULL,
    `reason` VARCHAR(50) NOT NULL,
    `meta_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `score_events_session_id_player_id_idx`(`session_id`, `player_id`),
    INDEX `score_events_round_id_idx`(`round_id`),
    INDEX `score_events_player_id_idx`(`player_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `games` ADD CONSTRAINT `games_quiz_id_fkey` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `games` ADD CONSTRAINT `games_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_rounds` ADD CONSTRAINT `session_rounds_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_rounds` ADD CONSTRAINT `session_rounds_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_events` ADD CONSTRAINT `score_events_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_events` ADD CONSTRAINT `score_events_round_id_fkey` FOREIGN KEY (`round_id`) REFERENCES `session_rounds`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_events` ADD CONSTRAINT `score_events_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reprise des données : un jeu par quiz (même slug, moteur 'quiz').
INSERT INTO `games` (
    `slug`, `title`, `description`, `engine_key`, `quiz_id`, `kind`, `sponsor_id`, `status`,
    `cover_image_url`, `duration_estimate_seconds`, `created_at`, `updated_at`
)
SELECT
    q.`slug`,
    q.`title`,
    q.`description`,
    'quiz',
    q.`id`,
    CASE WHEN q.`type` = 'sponsored' THEN 'sponsored' ELSE 'internal' END,
    q.`sponsor_id`,
    CAST(q.`status` AS CHAR),
    q.`cover_image_url`,
    q.`duration_estimate_seconds`,
    q.`created_at`,
    CURRENT_TIMESTAMP(3)
FROM `quizzes` q;

-- Reprise des données : une manche (position 1) par séance, sur le jeu de son quiz.
INSERT INTO `session_rounds` (`session_id`, `position`, `game_id`, `state`, `started_at`, `ended_at`)
SELECT
    s.`id`,
    1,
    g.`id`,
    CASE s.`state`
        WHEN 'ended' THEN 'ended'
        WHEN 'aborted' THEN 'skipped'
        WHEN 'running' THEN 'running'
        WHEN 'paused' THEN 'running'
        ELSE 'pending'
    END,
    s.`started_at`,
    CASE WHEN s.`state` = 'ended' THEN s.`ended_at` ELSE NULL END
FROM `sessions` s
INNER JOIN `games` g ON g.`quiz_id` = s.`quiz_id`;
