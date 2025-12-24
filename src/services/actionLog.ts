import type { PrismaClient } from '@prisma/client'

export async function logAction(db: PrismaClient, performerId: number, actionType: string, details: string) {
  await db.actionLog.create({
    data: {
      performerId,
      actionType,
      details,
    },
  })
}
