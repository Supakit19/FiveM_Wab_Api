import { Elysia, t } from 'elysia'
import { jwtGuard } from '../middlewares/auth.middleware'
import { logAction } from '../services/actionLog'

export const announcementRoutes = (app: any) =>
  app
    // user/admin: list announcements that are visible "now"
    .use(jwtGuard(['ADMIN', 'USER']))
    .get('/active', async (ctx: any) => {
      const { db } = ctx
      const now = new Date()
      return db.announcement.findMany({
        where: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      })
    })
    // admin: list all
    .get(
      '/',
      async (ctx: any) => {
        const { db, currentUser } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }
        return db.announcement.findMany({ orderBy: { createdAt: 'desc' } })
      },
    )
    // admin: create
    .post(
      '/',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const created = await db.announcement.create({
          data: {
            title: body.title,
            content: body.content,
            status: body.status,
            priority: body.priority,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
          },
        })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_CREATE_ANNOUNCEMENT',
          `Create announcement #${created.id}: ${created.title}`,
        )

        return created
      },
      {
        body: t.Object({
          title: t.String({ minLength: 1 }),
          content: t.String({ minLength: 1 }),
          status: t.Union([t.Literal('ACTIVE'), t.Literal('DRAFT'), t.Literal('EXPIRED')]),
          priority: t.Union([t.Literal('URGENT'), t.Literal('NORMAL')]),
          startDate: t.String({ minLength: 1 }),
          endDate: t.String({ minLength: 1 }),
        }),
      },
    )
    // admin: update
    .patch(
      '/:id',
      async (ctx: any) => {
        const { db, currentUser, params, body } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }

        const id = Number(params.id)
        const updated = await db.announcement.update({
          where: { id },
          data: {
            title: body.title,
            content: body.content,
            status: body.status,
            priority: body.priority,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
          },
        })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_UPDATE_ANNOUNCEMENT',
          `Update announcement #${updated.id}: ${updated.title}`,
        )

        return updated
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          title: t.String({ minLength: 1 }),
          content: t.String({ minLength: 1 }),
          status: t.Union([t.Literal('ACTIVE'), t.Literal('DRAFT'), t.Literal('EXPIRED')]),
          priority: t.Union([t.Literal('URGENT'), t.Literal('NORMAL')]),
          startDate: t.String({ minLength: 1 }),
          endDate: t.String({ minLength: 1 }),
        }),
      },
    )
    // admin: delete
    .delete(
      '/:id',
      async (ctx: any) => {
        const { db, currentUser, params } = ctx
        if (currentUser.role !== 'ADMIN') {
          throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้')
        }
        const id = Number(params.id)
        const deleted = await db.announcement.delete({ where: { id } })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_DELETE_ANNOUNCEMENT',
          `Delete announcement #${deleted.id}: ${deleted.title}`,
        )

        return { ok: true }
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      },
    )
