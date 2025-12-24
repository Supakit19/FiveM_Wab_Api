import { Elysia, t } from 'elysia'
import { jwtGuard } from '../middlewares/auth.middleware'

export type LogRow = {
  id: number
  performerId: number
  performerName: string | null
  performerRole: 'ADMIN' | 'USER' | null
  actionType: string
  details: string
  timestamp: string
}

export const logRoutes = (app: any) =>
  app
    .use(jwtGuard(['ADMIN', 'USER']))
    .get(
      '/',
      async (ctx: any) => {
        const { db, currentUser, query } = ctx

        const take = Math.min(Math.max(Number(query?.take ?? 50) || 50, 1), 200)
        const skip = Math.max(Number(query?.skip ?? 0) || 0, 0)
        const actionType = (query?.actionType as string | undefined) || undefined
        const actionTypesRaw = (query?.actionTypes as string | undefined) || undefined
        const actionTypes = actionTypesRaw
          ? actionTypesRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined
        const performerIdRaw = (query?.performerId as string | undefined) || undefined
        const performerId = performerIdRaw ? Number(performerIdRaw) : undefined

        const where: any = {}

        if (currentUser.role !== 'ADMIN') {
          where.performerId = currentUser.id
        } else if (performerId && Number.isFinite(performerId)) {
          where.performerId = performerId
        }

        if (actionTypes && actionTypes.length > 0) {
          where.actionType = { in: actionTypes }
        } else if (actionType) {
          where.actionType = actionType
        }

        const logs = await db.actionLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take,
          skip,
        })

        const itemIdRegex = /itemId=(\d+)/
        const qtyRegex = /qty=(\d+)/
        const itemIds = Array.from(
          new Set(
            logs
              .map((l: any) => {
                const m = String(l.details ?? '').match(itemIdRegex)
                return m ? Number(m[1]) : null
              })
              .filter((v: any) => typeof v === 'number' && Number.isFinite(v)),
          ),
        ) as number[]

        const items = itemIds.length
          ? await db.item.findMany({
              where: { id: { in: itemIds } },
              select: { id: true, name: true },
            })
          : []

        const itemMap: Map<number, any> = new Map(items.map((i: any) => [i.id, i]))

        const performerIds = Array.from(new Set(logs.map((l: any) => l.performerId)))
        const users = performerIds.length
          ? await db.user.findMany({
              where: { id: { in: performerIds } },
              select: { id: true, inGameName: true, role: true },
            })
          : []

        const userMap: Map<number, any> = new Map(users.map((u: any) => [u.id, u]))

        const data: LogRow[] = logs.map((l: any) => {
          const u = userMap.get(l.performerId)

          let details = String(l.details ?? '')
          const itemIdMatch = details.match(itemIdRegex)
          const qtyMatch = details.match(qtyRegex)
          const itemId = itemIdMatch ? Number(itemIdMatch[1]) : null
          const qty = qtyMatch ? Number(qtyMatch[1]) : null
          const item = itemId ? itemMap.get(itemId) : null

          if (l.actionType === 'USER_WITHDRAW' && item && qty) {
            details = `เบิกของ: ${item.name} x${qty}`
          }
          if (l.actionType === 'ADMIN_DEPOSIT' && item && qty) {
            details = `ฝากของ: ${item.name} x${qty}`
          }
          if (l.actionType === 'USER_CHECKIN') {
            details = 'เช็คชื่อ'
          }
          if (l.actionType === 'USER_LOGIN') {
            details = 'เข้าสู่ระบบ'
          }

          return {
            id: l.id,
            performerId: l.performerId,
            performerName: u?.inGameName ?? null,
            performerRole: (u?.role as any) ?? null,
            actionType: l.actionType,
            details,
            timestamp: l.timestamp.toISOString(),
          }
        })

        return {
          data,
          page: {
            take,
            skip,
            hasMore: logs.length === take,
          },
        }
      },
      {
        query: t.Optional(
          t.Object({
            take: t.Optional(t.Union([t.String(), t.Number()])),
            skip: t.Optional(t.Union([t.String(), t.Number()])),
            actionType: t.Optional(t.String()),
            actionTypes: t.Optional(t.String()),
            performerId: t.Optional(t.String()),
          }),
        ),
      },
    )
    .get('/me', async (ctx: any) => {
      const { db, currentUser } = ctx

      const logs = await db.actionLog.findMany({
        where: { performerId: currentUser.id },
        orderBy: { timestamp: 'desc' },
        take: 200,
      })

      return logs.map((l: any) => ({
        id: l.id,
        performerId: l.performerId,
        performerName: currentUser.inGameName,
        performerRole: currentUser.role,
        actionType: l.actionType,
        details: l.details,
        timestamp: l.timestamp.toISOString(),
      }))
    })
