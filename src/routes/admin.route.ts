import { Elysia, t } from 'elysia'
import * as bcrypt from 'bcrypt'
import { jwtGuard } from '../middlewares/auth.middleware'
import { logAction } from '../services/actionLog'

const DEFAULT_RESET_PASSWORD = 'user123'

export const adminRoutes = (app: any) =>
  app
    .use(jwtGuard(['ADMIN']))
    .get('/users', async (ctx: any) => {
      const { db } = ctx
      return db.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          inGameName: true,
          phoneNumber: true,
          role: true,
          money: true,
          profileImageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    })
    .post(
      '/users',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx

        const password = body.password && String(body.password).length > 0 ? String(body.password) : DEFAULT_RESET_PASSWORD
        const hashedPassword = await bcrypt.hash(password, 10)

        const created = await db.user.create({
          data: {
            inGameName: body.inGameName,
            phoneNumber: body.phoneNumber,
            password: hashedPassword,
            role: body.role,
          },
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            profileImageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        await logAction(db, currentUser.id, 'ADMIN_CREATE_USER', `Create user: ${created.inGameName} (${created.phoneNumber}) role=${created.role}`)

        return {
          ok: true,
          user: created,
          initialPassword: password,
        }
      },
      {
        body: t.Object({
          inGameName: t.String({ minLength: 1 }),
          phoneNumber: t.String({ minLength: 6, maxLength: 10 }),
          role: t.Union([t.Literal('ADMIN'), t.Literal('USER')]),
          password: t.Optional(t.String({ minLength: 1 })),
        }),
      },
    )
    .patch(
      '/users/:id/role',
      async (ctx: any) => {
        const { db, currentUser, params, body } = ctx
        const id = Number(params.id)

        const updated = await db.user.update({
          where: { id },
          data: { role: body.role },
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            profileImageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        await logAction(db, currentUser.id, 'ADMIN_UPDATE_USER_ROLE', `Update role: userId=${id} -> ${updated.role}`)

        return { ok: true, user: updated }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ role: t.Union([t.Literal('ADMIN'), t.Literal('USER')]) }),
      },
    )
    .patch(
      '/users/:id',
      async (ctx: any) => {
        const { db, currentUser, params, body } = ctx
        const id = Number(params.id)

        const updateData: any = {}
        if (body.inGameName !== undefined) updateData.inGameName = body.inGameName
        if (body.phoneNumber !== undefined) updateData.phoneNumber = body.phoneNumber
        if (body.role !== undefined) updateData.role = body.role

        const updated = await db.user.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            profileImageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        await logAction(db, currentUser.id, 'ADMIN_UPDATE_USER', `Update user: ${updated.inGameName} (${updated.phoneNumber}) role=${updated.role}`)

        return { ok: true, user: updated }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          inGameName: t.Optional(t.String({ minLength: 1 })),
          phoneNumber: t.Optional(t.String({ minLength: 6, maxLength: 10 })),
          role: t.Optional(t.Union([t.Literal('ADMIN'), t.Literal('USER')])),
        }),
      },
    )
    .patch(
      '/users/:id/reset-password',
      async (ctx: any) => {
        const { db, currentUser, params } = ctx
        const id = Number(params.id)

        const hashedPassword = await bcrypt.hash(DEFAULT_RESET_PASSWORD, 10)
        const updated = await db.user.update({
          where: { id },
          data: { password: hashedPassword },
          select: { id: true, inGameName: true, phoneNumber: true, role: true },
        })

        await logAction(db, currentUser.id, 'ADMIN_RESET_PASSWORD', `Reset password: userId=${id} (${updated.phoneNumber})`)

        return {
          ok: true,
          userId: updated.id,
          resetTo: DEFAULT_RESET_PASSWORD,
        }
      },
      {
        params: t.Object({ id: t.String() }),
      },
    )
    .delete(
      '/users/:id',
      async (ctx: any) => {
        const { db, currentUser, params } = ctx
        const id = Number(params.id)

        const userToDelete = await db.user.findUnique({
          where: { id },
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            attendances: { select: { id: true } },
            transactions: { select: { id: true } },
          },
        })

        if (!userToDelete) {
          throw new Error('User not found')
        }

        // Delete related records first to avoid foreign key constraint errors
        if (userToDelete.attendances.length > 0) {
          await db.attendanceLog.deleteMany({
            where: { userId: id },
          })
        }

        if (userToDelete.transactions.length > 0) {
          await db.inventoryTransaction.deleteMany({
            where: { userId: id },
          })
        }

        // Now delete the user
        await db.user.delete({
          where: { id },
        })

        await logAction(db, currentUser.id, 'ADMIN_DELETE_USER', `Delete user: ${userToDelete.inGameName} (${userToDelete.phoneNumber}) role=${userToDelete.role} (${userToDelete.attendances.length} attendances, ${userToDelete.transactions.length} transactions deleted)`)

        return {
          ok: true,
          deletedUserId: id,
          deletedRecords: {
            attendances: userToDelete.attendances.length,
            transactions: userToDelete.transactions.length,
          },
        }
      },
      {
        params: t.Object({ id: t.String() }),
      },
    )
    // admin: update user money
    .patch(
      '/users/:id/money',
      async (ctx: any) => {
        const { db, currentUser, params, body } = ctx
        const id = Number(params.id)

        const user = await db.user.findUnique({ where: { id } })
        if (!user) throw new Error('ไม่พบผู้ใช้')

        let newMoney: number
        if (body.action === 'set') {
          newMoney = body.amount
        } else if (body.action === 'add') {
          newMoney = user.money + body.amount
        } else if (body.action === 'subtract') {
          newMoney = user.money - body.amount
        } else {
          throw new Error('action ไม่ถูกต้อง')
        }

        // Prevent negative money
        if (newMoney < 0) newMoney = 0

        const updated = await db.user.update({
          where: { id },
          data: { money: newMoney },
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            money: true,
          },
        })

        await logAction(
          db,
          currentUser.id,
          'ADMIN_UPDATE_USER_MONEY',
          `Update money: ${user.inGameName} (${user.phoneNumber}) ${user.money} -> ${newMoney} (${body.action} ${body.amount}) reason: ${body.reason || '-'}`,
        )

        return { ok: true, user: updated }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          action: t.Union([t.Literal('set'), t.Literal('add'), t.Literal('subtract')]),
          amount: t.Number(),
          reason: t.Optional(t.String()),
        }),
      },
    )
    // admin: get all settings
    .get('/settings', async (ctx: any) => {
      const { db } = ctx
      return db.globalSetting.findMany()
    })
    // admin: update setting
    .put(
      '/settings',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx
        
        const updated = await db.globalSetting.upsert({
            where: { key: body.key },
            update: { value: body.value },
            create: { key: body.key, value: body.value, description: body.description ?? '' }
        })

        await logAction(db, currentUser.id, 'ADMIN_UPDATE_SETTING', `Update setting: ${body.key} = ${body.value}`)
        
        return { ok: true, setting: updated }
      },
      {
          body: t.Object({
              key: t.String(),
              value: t.String(),
              description: t.Optional(t.String())
          })
      }
    )
