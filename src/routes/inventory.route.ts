import { Elysia, t } from 'elysia'
import { jwtGuard } from '../middlewares/auth.middleware'
import { logAction } from '../services/actionLog'

export const inventoryRoutes = (app: any) =>
  app
    .use(jwtGuard(['ADMIN', 'USER']))
    .get('/items', async (ctx: any) => {
      const { db } = ctx
      return db.item.findMany({
        orderBy: { name: 'asc' },
      })
    })
    .post(
      '/withdraw',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx
        const itemId = Number(body.itemId)
        const qty = Math.abs(Number(body.quantity))

        if (!Number.isFinite(itemId) || itemId <= 0) throw new Error('itemId ไม่ถูกต้อง')
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('quantity ไม่ถูกต้อง')

        const result = await db.$transaction(async (tx: any) => {
          const item = await tx.item.findUnique({ where: { id: itemId } })
          if (!item) throw new Error('ไม่พบไอเท็ม')
          if (item.currentStock < qty) throw new Error('ยอดคงเหลือไม่พอ')

          const updatedItem = await tx.item.update({
            where: { id: itemId },
            data: {
              currentStock: { decrement: qty },
              lastUpdated: new Date(),
            },
          })

          const txLog = await tx.inventoryTransaction.create({
            data: {
              userId: currentUser.id,
              itemId,
              quantity: -qty,
              transactionType: 'WITHDRAWAL',
              reason: body.reason ?? null,
            },
          })

          return { item: updatedItem, transaction: txLog }
        })

        await logAction(
          db,
          currentUser.id,
          'USER_WITHDRAW',
          `Withdraw itemId=${itemId}, qty=${qty}${body.reason ? `, reason=${body.reason}` : ''}`,
        )

        return { ok: true, ...result }
      },
      {
        body: t.Object({
          itemId: t.Union([t.Number(), t.String()]),
          quantity: t.Union([t.Number(), t.String()]),
          reason: t.Optional(t.String()),
        }),
      },
    )
    .post(
      '/deposit',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const itemId = Number(body.itemId)
        const qty = Math.abs(Number(body.quantity))

        if (!Number.isFinite(itemId) || itemId <= 0) throw new Error('itemId ไม่ถูกต้อง')
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('quantity ไม่ถูกต้อง')

        const result = await db.$transaction(async (tx: any) => {
          const item = await tx.item.findUnique({ where: { id: itemId } })
          if (!item) throw new Error('ไม่พบไอเท็ม')

          const updatedItem = await tx.item.update({
            where: { id: itemId },
            data: {
              currentStock: { increment: qty },
              lastUpdated: new Date(),
            },
          })

          const txLog = await tx.inventoryTransaction.create({
            data: {
              userId: currentUser.id,
              itemId,
              quantity: qty,
              transactionType: 'DEPOSIT',
              reason: body.reason ?? null,
            },
          })

          return { item: updatedItem, transaction: txLog }
        })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_DEPOSIT',
          `Deposit itemId=${itemId}, qty=${qty}${body.reason ? `, reason=${body.reason}` : ''}`,
        )

        return { ok: true, ...result }
      },
      {
        body: t.Object({
          itemId: t.Union([t.Number(), t.String()]),
          quantity: t.Union([t.Number(), t.String()]),
          reason: t.Optional(t.String()),
        }),
      },
    )
    .get('/transactions/me', async (ctx: any) => {
      const { db, currentUser } = ctx
      return db.inventoryTransaction.findMany({
        where: { userId: currentUser.id },
        orderBy: { timestamp: 'desc' },
        take: 100,
        include: { item: true },
      })
    })
    // List transactions with filters
    .get(
      '/transactions',
      async (ctx: any) => {
        const { db, query } = ctx
        const startDate = query.startDate ? new Date(query.startDate) : undefined
        const endDate = query.endDate ? new Date(query.endDate) : undefined
        const itemId = query.itemId ? Number(query.itemId) : undefined
        const type = query.type

        const where: any = {}
        if (startDate && endDate) {
          where.timestamp = {
            gte: startDate,
            lte: endDate,
          }
        } else if (startDate) {
          where.timestamp = { gte: startDate }
        }

        if (itemId) where.itemId = itemId
        if (type) where.transactionType = type

        const total = await db.inventoryTransaction.count({ where })
        const transactions = await db.inventoryTransaction.findMany({
          where,
          include: { item: true, user: true },
          orderBy: { timestamp: 'desc' },
          take: 100, // Limit for now
        })

        return { transactions, total }
      },
      {
        query: t.Object({
          startDate: t.Optional(t.String()),
          endDate: t.Optional(t.String()),
          itemId: t.Optional(t.String()),
          type: t.Optional(t.String()),
        }),
      },
    )
    // Daily Summary
    .get(
      '/summary',
      async (ctx: any) => {
        const { db, query } = ctx
        const dateStr = query.date || new Date().toISOString().split('T')[0]
        const targetDate = new Date(dateStr)
        const nextDate = new Date(targetDate)
        nextDate.setDate(targetDate.getDate() + 1)

        // Find all transactions for this day
        const transactions = await db.inventoryTransaction.findMany({
          where: {
            timestamp: {
              gte: targetDate,
              lt: nextDate,
            },
          },
          include: { item: true },
        })

        // Aggregate by Item
        const summaryMap = new Map<number, { item: any; receive: number; sell: number }>()

        for (const tx of transactions) {
          if (!summaryMap.has(tx.itemId)) {
            summaryMap.set(tx.itemId, { item: tx.item, receive: 0, sell: 0 })
          }
          const entry = summaryMap.get(tx.itemId)!
          if (tx.transactionType === 'DEPOSIT') {
            entry.receive += tx.quantity
          } else if (tx.transactionType === 'WITHDRAWAL') {
            entry.sell += Math.abs(tx.quantity)
          }
        }

        return Array.from(summaryMap.values()).map(v => ({
          ...v,
          net: v.receive - v.sell,
        }))
      },
      {
        query: t.Object({
          date: t.Optional(t.String()),
        }),
      },
    )
    // Create new item (Admin)
    .post(
      '/items',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const created = await db.item.create({
          data: {
            name: body.name,
            currentStock: body.currentStock || 0,
          },
        })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_CREATE_ITEM',
          `Create item #${created.id}: ${created.name} (stock: ${created.currentStock})`,
        )

        return created
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          currentStock: t.Optional(t.Number()),
        }),
      },
    )
    // admin: update item
    .patch(
      '/items/:id',
      async (ctx: any) => {
        const { db, currentUser, params, body } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const id = Number(params.id)
        const updated = await db.item.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: body.name }),
            ...(body.currentStock !== undefined && { currentStock: body.currentStock }),
            lastUpdated: new Date(),
          },
        })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_UPDATE_ITEM',
          `Update item #${updated.id}: ${updated.name}`,
        )

        return updated
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1 })),
          currentStock: t.Optional(t.Number()),
        }),
      },
    )
    // admin: delete item
    .delete(
      '/items/:id',
      async (ctx: any) => {
        const { db, currentUser, params } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const id = Number(params.id)
        const item = await db.item.findUnique({ where: { id } })
        if (!item) throw new Error('ไม่พบไอเท็ม')

        // Check if there are any transactions
        const txCount = await db.inventoryTransaction.count({
          where: { itemId: id },
        })

        if (txCount > 0) {
          throw new Error(
            `ไม่สามารถลบไอเท็มนี้ได้ เนื่องจากมีประวัติธุรกรรม ${txCount} รายการ`,
          )
        }

        await db.item.delete({ where: { id } })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_DELETE_ITEM',
          `Delete item #${id}: ${item.name}`,
        )

        return { ok: true }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      },
    )
