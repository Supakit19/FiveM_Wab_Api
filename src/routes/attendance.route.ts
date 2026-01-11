import { Elysia, t } from "elysia";
import { jwtGuard } from "../middlewares/auth.middleware";
import { logAction } from "../services/actionLog";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Helper to get minutes from HH:mm
function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper to check if current time is within a round
// Returns the round ID if match, else null
async function getCurrentSessionId(
  db: any,
  now: Date
): Promise<{ sessionId: number | null; rounds: any[] }> {
  const setting = await db.globalSetting.findUnique({
    where: { key: "attendance_rounds" },
  });
  if (!setting) return { sessionId: null, rounds: [] };

  const rounds = JSON.parse(setting.value);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const round of rounds) {
    const start = timeToMinutes(round.startTime);
    const end = timeToMinutes(round.endTime);
    if (currentMinutes >= start && currentMinutes <= end) {
      return { sessionId: round.id, rounds };
    }
  }

  return { sessionId: null, rounds };
}

export const attendanceRoutes = (app: any) =>
  app
    // Public endpoint for all users to get user list (for attendance sheet)
    .get("/users", async (ctx: any) => {
      const { db } = ctx;
      return db.user.findMany({
        orderBy: { inGameName: "asc" },
        select: {
          id: true,
          inGameName: true,
          phoneNumber: true,
          role: true,
        },
      });
    })
    // POST /attendance/checkin - User check-in
    .use(jwtGuard(["ADMIN", "USER"]))
    .get("/today", async (ctx: any) => {
      const { db, currentUser } = ctx;

      const now = new Date();
      const from = startOfDay(now);
      const to = endOfDay(now);

      // Get Round Config
      const { rounds } = await getCurrentSessionId(db, now);

      // Get all sessions for today
      const attendances = await db.attendanceLog.findMany({
        where: {
          userId: currentUser.id,
          checkInTime: { gte: from, lte: to },
        },
        orderBy: { session: "asc" },
      });

      // Map attendances to rounds dynamically
      const sessions: Record<number, any> = {};

      // Initialize all configured rounds as null
      if (rounds && Array.isArray(rounds)) {
        rounds.forEach((r: any) => {
          sessions[r.id] = null;
        });
      }

      // Fill in actual data
      attendances.forEach((a: any) => {
        sessions[a.session] = a;
      });

      const { sessionId: currentSession, rounds: _ } =
        await getCurrentSessionId(db, now);

      return {
        sessions,
        currentSession,
        totalChecked: attendances.length,
        roundsConfig: rounds, // Send config to frontend so it knows names/times
      };
    })
    .post("/checkin", async (ctx: any) => {
      const { db, currentUser } = ctx;

      const now = new Date();
      const from = startOfDay(now);
      const to = endOfDay(now);

      // Detect current session from DB Config
      const { sessionId: currentSession, rounds } = await getCurrentSessionId(
        db,
        now
      );

      if (!currentSession) {
        return {
          ok: false,
          message: "ไม่อยู่ในช่วงเวลาเช็คชื่อ กรุณาเช็คชื่อในช่วงเวลาที่กำหนด",
          currentSession: null,
        };
      }

      const roundInfo = rounds.find((r: any) => r.id === currentSession);
      const roundName = roundInfo ? roundInfo.name : `รอบที่ ${currentSession}`;

      // Check if already checked-in for this session
      const existed = await db.attendanceLog.findFirst({
        where: {
          userId: currentUser.id,
          session: currentSession,
          checkInTime: { gte: from, lte: to },
        },
      });

      if (existed) {
        return {
          ok: false,
          message: `คุณเช็คชื่อ${roundName}ไปแล้ว`,
          attendance: existed,
          currentSession,
        };
      }

      // Create check-in record
      const attendance = await db.attendanceLog.create({
        data: {
          userId: currentUser.id,
          session: currentSession,
          status: "O", // 'O' = Present
        },
      });

      await logAction(
        db,
        currentUser.id,
        "USER_CHECKIN",
        `Check-in: ${roundName} (${currentUser.inGameName})`
      );

      return {
        ok: true,
        message: `เช็คชื่อ${roundName}สำเร็จ!`,
        attendance,
        currentSession,
      };
    })
    .post(
      "/admin-checkin",
      async (ctx: any) => {
        const { db, currentUser, body } = ctx;

        if (currentUser.role !== "ADMIN") {
          throw new Error("Access denied");
        }

        const { userId, session, status, date } = body;

        // Use provided date or default to today
        const targetDate = date ? new Date(date) : new Date();
        const from = startOfDay(targetDate);
        const to = endOfDay(targetDate);

        // If status is '-' or null, remove the record
        if (status === "-" || !status) {
          await db.attendanceLog.deleteMany({
            where: {
              userId,
              session,
              checkInTime: { gte: from, lte: to },
            },
          });
          return { ok: true, message: "Cleared attendance" };
        }

        // Check if exists
        const existing = await db.attendanceLog.findFirst({
          where: {
            userId,
            session,
            checkInTime: { gte: from, lte: to },
          },
        });

        if (existing) {
          await db.attendanceLog.update({
            where: { id: existing.id },
            data: { status },
          });
        } else {
          await db.attendanceLog.create({
            data: {
              userId,
              session,
              status,
              checkInTime: targetDate,
            },
          });
        }

        return { ok: true, message: "Updated attendance" };
      },
      {
        body: t.Object({
          userId: t.Number(),
          session: t.Number(),
          status: t.Union([t.String(), t.Null()]),
          date: t.Optional(t.String()),
        }),
      }
    )

    .get("/me", async (ctx: any) => {
      const { db, currentUser } = ctx;
      return db.attendanceLog.findMany({
        where: { userId: currentUser.id },
        orderBy: { checkInTime: "desc" },
        take: 60,
      });
    })
    .get(
      "/",
      async (ctx: any) => {
        const { db, query } = ctx;

        const where: any = {};

        if (query?.date) {
          const d = new Date(query.date);
          where.checkInTime = {
            gte: startOfDay(d),
            lte: endOfDay(d),
          };
        } else if (query?.startDate || query?.endDate) {
          where.checkInTime = {};
          if (query.startDate)
            where.checkInTime.gte = startOfDay(new Date(query.startDate));
          if (query.endDate)
            where.checkInTime.lte = endOfDay(new Date(query.endDate));
        }

        if (query?.session) {
          where.session = parseInt(query.session);
        }

        return db.attendanceLog.findMany({
          where,
          orderBy: { checkInTime: "desc" },
          take: 1000,
          include: { user: true },
        });
      },
      {
        query: t.Optional(
          t.Object({
            date: t.Optional(t.String()),
            startDate: t.Optional(t.String()),
            endDate: t.Optional(t.String()),
            session: t.Optional(t.String()),
          })
        ),
      }
    )

    // GET /attendance/statistics - Get attendance statistics by user
    .get(
      "/statistics",
      async (ctx: any) => {
        const { db, query } = ctx;

        // Default to last 30 days if no date range specified
        const endDate = query?.endDate ? new Date(query.endDate) : new Date();
        const startDate = query?.startDate
          ? new Date(query.startDate)
          : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        const from = startOfDay(startDate);
        const to = endOfDay(endDate);

        // Get all users
        const users = await db.user.findMany({
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            profileImageUrl: true,
          },
          orderBy: { inGameName: "asc" },
        });

        // Get attendance logs for the date range
        const logs = await db.attendanceLog.findMany({
          where: {
            checkInTime: {
              gte: from,
              lte: to,
            },
          },
          select: {
            userId: true,
            status: true,
          },
        });

        // Aggregate statistics by user
        const stats = users.map((user) => {
          const userLogs = logs.filter((log) => log.userId === user.id);

          const present = userLogs.filter((log) => log.status === "O").length;
          const late = userLogs.filter((log) => log.status === "L").length;
          const absent = userLogs.filter((log) => log.status === "A").length;
          const leave = userLogs.filter((log) => log.status === "-").length;

          return {
            user: {
              id: user.id,
              inGameName: user.inGameName,
              phoneNumber: user.phoneNumber,
              role: user.role,
              profileImageUrl: user.profileImageUrl,
            },
            stats: {
              present,
              late,
              absent,
              leave,
              total: present + late + absent + leave,
            },
          };
        });

        return stats;
      },
      {
        query: t.Optional(
          t.Object({
            startDate: t.Optional(t.String()),
            endDate: t.Optional(t.String()),
          })
        ),
      }
    );
