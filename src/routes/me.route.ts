import { Elysia, t } from 'elysia'
import * as bcrypt from 'bcrypt'
import { jwtGuard } from '../middlewares/auth.middleware'
import { logAction } from '../services/actionLog'
import { join } from 'path'
import { write } from 'bun'

export const meRoutes = (app: any) =>
  app
    .use(jwtGuard(['ADMIN', 'USER']))
    .get('/', async (ctx: any) => {
      const { db, currentUser } = ctx
      const user = await db.user.findUnique({
        where: { id: currentUser.id },
        select: {
          id: true,
          inGameName: true,
          phoneNumber: true,
          role: true,
          money: true,
          profileImageUrl: true,
          createdAt: true,
        },
      })
      return user
    })
    .patch(
      '/',
      async (ctx: any) => {
        const { db, currentUser, body } = ctx
        const userId = currentUser.id

        // Check if updating password
        if (body.newPassword) {
          if (!body.currentPassword) {
            throw new Error('กรุณาระบุรหัสผ่านปัจจุบัน')
          }
          
          const user = await db.user.findUnique({ where: { id: userId } })
          const isMatch = await bcrypt.compare(body.currentPassword, user.password)
          
          if (!isMatch) {
            throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง')
          }

          const hashed = await bcrypt.hash(body.newPassword, 10)
          
          await db.user.update({
             where: { id: userId },
             data: { password: hashed }
          })
          
          await logAction(db, userId, 'USER_CHANGE_PASSWORD', 'User changed password')
        }

        // Update other fields
        const updateData: any = {}
        if (body.inGameName) updateData.inGameName = body.inGameName
        if (body.profileImageUrl) updateData.profileImageUrl = body.profileImageUrl

        if (Object.keys(updateData).length > 0) {
           const updated = await db.user.update({
             where: { id: userId },
             data: updateData,
             select: { id: true, inGameName: true, profileImageUrl: true }
           })
           
           await logAction(db, userId, 'USER_UPDATE_PROFILE', `Updated profile: ${JSON.stringify(updateData)}`)
           return updated
        }

        return { message: 'Updated successfully' }
      },
      {
        body: t.Object({
          inGameName: t.Optional(t.String()),
          profileImageUrl: t.Optional(t.String()),
          currentPassword: t.Optional(t.String()),
          newPassword: t.Optional(t.String({ minLength: 6 })),
        }),
      }
    )
    .post(
      '/upload',
      async (ctx: any) => {
        const { currentUser, body } = ctx
        const file = body.file

        if (!file) throw new Error('No file uploaded')

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
        const extension = file.name.split('.').pop()
        const filename = `avatar-${currentUser.id}-${uniqueSuffix}.${extension}`
        const uploadDir = 'public/uploads'
        const filePath = join(uploadDir, filename)

        await write(filePath, file)

        const publicUrl = `/public/uploads/${filename}`
        return { url: publicUrl }
      },
      {
        body: t.Object({
          file: t.File(),
        }),
      }
    )
