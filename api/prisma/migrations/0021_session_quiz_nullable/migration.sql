-- B5 : une séance peut enchaîner plusieurs jeux ; sessions.quiz_id devient le quiz de la
-- première manche de moteur quiz, null si la séance n'en a pas.

-- DropForeignKey
ALTER TABLE `sessions` DROP FOREIGN KEY `sessions_quiz_id_fkey`;

-- AlterTable
ALTER TABLE `sessions` MODIFY `quiz_id` BIGINT NULL;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_quiz_id_fkey` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
