// file: src/routes/auth.route.ts
import { Elysia, t } from 'elysia';
import * as bcrypt from 'bcrypt';
import { logAction } from '../services/actionLog';

export const authRoutes = (app: any) =>
  app.post(
    '/login',
    async (ctx: any) => {
      const { body, db, jwt } = ctx;
      const { phoneNumber, password } = body;

      // 1. ค้นหาผู้ใช้จากเบอร์ในเกม (phoneNumber)
      const user = await db.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new Error('เบอร์ในเกมหรือรหัสผ่านไม่ถูกต้อง');
      }

      // 2. เปรียบเทียบรหัสผ่าน
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        throw new Error('เบอร์ในเกมหรือรหัสผ่านไม่ถูกต้อง');
      }

      // 3. สร้าง JWT Token
      const token = await jwt.sign({
        userId: user.id,
        role: user.role,
        inGameName: user.inGameName,
      });

      // 4. ส่ง Token และข้อมูลผู้ใช้กลับไป
      await logAction(db, user.id, 'USER_LOGIN', `Login: ${user.inGameName} (${user.phoneNumber})`);

      return {
        message: 'Login สำเร็จ',
        token,
        user: {
          id: user.id,
          inGameName: user.inGameName,
          role: user.role,
          profileImageUrl: user.profileImageUrl,
        },
      };
    },
    {
      // กำหนด Schema สำหรับ Body (Validation)
      body: t.Object({
        phoneNumber: t.String({ minLength: 6, maxLength: 10 }),
        password: t.String({ minLength: 6 }),
      }),
    },
  );