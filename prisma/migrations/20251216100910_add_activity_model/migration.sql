/*
  Warnings:

  - You are about to drop the column `price` on the `items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `items` DROP COLUMN `price`;

-- CreateTable
CREATE TABLE `activities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `event_type` VARCHAR(191) NOT NULL DEFAULT 'EVENT',
    `location` VARCHAR(191) NULL,
    `max_participants` INTEGER NULL,
    `current_participants` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UPCOMING',
    `start_date_time` DATETIME(3) NOT NULL,
    `end_date_time` DATETIME(3) NOT NULL,
    `rewards` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
