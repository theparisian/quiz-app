-- Les codes de séance à 4 chiffres ne sont uniques que parmi les séances actives
-- (lobby / running / paused) : une séance terminée peut partager son code avec une nouvelle.
-- L'index unique devient un index simple (aucune donnée supprimée).
-- CreateIndex
CREATE INDEX `sessions_slug_short_idx` ON `sessions`(`slug_short`);

-- DropIndex
DROP INDEX `sessions_slug_short_key` ON `sessions`;
