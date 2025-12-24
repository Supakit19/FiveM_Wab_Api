import { Elysia, t } from 'elysia'
import { jwtGuard } from '../middlewares/auth.middleware'
import { logAction } from '../services/actionLog'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export const attendanceRoutes = (app: any) =>
  app
    .use(jwtGuard(['ADMIN', 'USER']))
    .get('/today', async (ctx: any) => {
      const { db, currentUser } = ctx

      const now = new Date()
      const from = startOfDay(now)
      const to = endOfDay(now)

      const attendance = await db.attendanceLog.findFirst({
        where: {
          userId: currentUser.id,
          checkInTime: { gte: from, lte: to },
        },
      })

      return {
        checked: Boolean(attendance),
        attendance: attendance ?? null,
      }
    })
    .post('/checkin', async (ctx: any) => {
      const { db, currentUser } = ctx

      const now = new Date()
      const from = startOfDay(now)
      const to = endOfDay(now)

      const existed = await db.attendanceLog.findFirst({
        where: {
          userId: currentUser.id,
          checkInTime: { gte: from, lte: to },
        },
      })

      if (existed) {
        return { ok: true, message: 'เช็คชื่อแล้ววันนี้', attendance: existed }
      }

      const attendance = await db.attendanceLog.create({
        data: {
          userId: currentUser.id,
          status: 'O',
        },
      })

      await logAction(db, currentUser.id, 'USER_CHECKIN', `Check-in: userId=${currentUser.id}`)

      return { ok: true, message: 'เช็คชื่อสำเร็จ', attendance }
    })
    .get('/me', async (ctx: any) => {
      const { db, currentUser } = ctx
      return db.attendanceLog.findMany({
        where: { userId: currentUser.id },
        orderBy: { checkInTime: 'desc' },
        take: 60,
      })
    })
    .get(
      '/',
      async (ctx: any) => {
        const { db, currentUser, query } = ctx

        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const where: any = {}

        if (query?.date) {
            const d = new Date(query.date)
            where.checkInTime = {
                gte: startOfDay(d),
                lte: endOfDay(d)
            }
        } else if (query?.startDate || query?.endDate) {
            where.checkInTime = {}
            if (query.startDate) where.checkInTime.gte = startOfDay(new Date(query.startDate))
            if (query.endDate) where.checkInTime.lte = endOfDay(new Date(query.endDate))
        }

        return db.attendanceLog.findMany({
          where,
          orderBy: { checkInTime: 'desc' },
          take: 1000,
          include: { user: true },
        })
      },
      {
        query: t.Optional(
          t.Object({
            date: t.Optional(t.String()),
            startDate: t.Optional(t.String()),
            endDate: t.Optional(t.String()),
          }),
        ),
      },
    )
