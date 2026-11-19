-- Rétention des contacts : les contacts ne sont jamais supprimés (preuve du consentement), mais
-- un contact sans activité depuis 3 ans sort de tous les exports et statistiques (filtre à la
-- lecture). Toute nouvelle activité de l'adresse remet le compteur à zéro.
-- AlterTable
ALTER TABLE `contacts` ADD COLUMN `last_activity_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Reprise : la plus récente des dates de création du contact et d'accord de ses consentements.
UPDATE `contacts` c
SET c.`last_activity_at` = GREATEST(
    c.`created_at`,
    COALESCE(
        (SELECT MAX(cc.`granted_at`) FROM `contact_consents` cc WHERE cc.`contact_id` = c.`id`),
        c.`created_at`
    )
);

-- CreateIndex
CREATE INDEX `contacts_last_activity_at_idx` ON `contacts`(`last_activity_at`);
