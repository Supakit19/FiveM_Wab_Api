-- DropForeignKey
ALTER TABLE `attendance_logs` DROP FOREIGN KEY `attendance_logs_user_id_fkey`;

-- DropIndex
DROP INDEX `attendance_logs_user_id_check_in_time_key` ON `attendance_logs`;

-- AlterTable
ALTER TABLE `attendance_logs` ADD COLUMN `session` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX `attendance_logs_user_id_check_in_time_idx` ON `attendance_logs`(`user_id`, `check_in_time`);

-- AddForeignKey
ALTER TABLE `attendance_logs` ADD CONSTRAINT `attendance_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
