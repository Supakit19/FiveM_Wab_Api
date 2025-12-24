// file: src/middlewares/auth.middleware.ts
import { Elysia } from 'elysia';

// 1. Middleware สำหรับตรวจสอบ Token และ Role
export const jwtGuard = (allowedRoles: ('ADMIN' | 'USER')[] = ['ADMIN', 'USER']) =>
  new Elysia().derive(
    { as: 'global' },
    async ({ headers, jwt, set }) => {
      const authHeader = headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        set.status = 401;
        throw new Error('โทเคนไม่ถูกต้องหรือไม่มี');
      }

      const token = authHeader.split(' ')[1];
      const payload = await jwt.verify(token);

      if (!payload || !payload.userId) {
        set.status = 401;
        throw new Error('โทเคนหมดอายุหรือใช้ไม่ได้');
      }

      // 2. ตรวจสอบ Role
      if (!allowedRoles.includes(payload.role as any)) {
        set.status = 403;
        throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
      }

      return {
        currentUser: {
          id: payload.userId as number,
          role: payload.role as 'ADMIN' | 'USER',
          inGameName: payload.inGameName as string,
        },
      };
    },
  );