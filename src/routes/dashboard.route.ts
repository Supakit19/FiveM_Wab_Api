import { Elysia } from "elysia";
import { jwtGuard } from "../middlewares/auth.middleware";

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

export const dashboardRoutes = (app: any) =>
  app
    .use(jwtGuard(["ADMIN", "USER"]))
    .get("/stats", async (ctx: any) => {
      const { db } = ctx;

      const now = new Date();
      const from = startOfDay(now);
      const to = endOfDay(now);

      const [
        usersTotal,
        checkinsToday,
        transactionsToday,
        activeAnnouncements,
        usersWithoutCheckin,
        attendanceDeadlineRes,
        gangBalanceRes,
      ] = await Promise.all([
        db.user.count(),
        db.attendanceLog.count({
          where: { checkInTime: { gte: from, lte: to } },
        }),
        db.inventoryTransaction.count({
          where: { timestamp: { gte: from, lte: to } },
        }),
        db.announcement.count({
          where: {
            status: "ACTIVE",
            startDate: { lte: now },
            endDate: { gte: now },
          },
        }),
        // นับผู้ใช้ที่ไม่ได้เช็คชื่อวันนี้
        db.user.count({
          where: {
            NOT: {
              attendances: {
                some: {
                  checkInTime: { gte: from, lte: to },
                },
              },
            },
          },
        }),
        // ดึงเวลาเส้นตาย (Global Setting)
        db.globalSetting.findUnique({
          where: { key: "attendance_deadline" },
          select: { value: true },
        }),
        // ดึงยอดเงินกองกลาง (Gang Balance)
        db.gangTransaction.findFirst({
          orderBy: { createdAt: "desc" },
          select: { balanceAfter: true },
        }),
      ]);

      const attendanceDeadline = attendanceDeadlineRes?.value || "10:00";
      const gangBalance = gangBalanceRes?.balanceAfter || 0;

      return {
        usersTotal,
        checkinsToday,
        transactionsToday,
        activeAnnouncements,
        usersWithoutCheckin,
        checkinRate:
          usersTotal > 0 ? Math.round((checkinsToday / usersTotal) * 100) : 0,
        attendanceDeadline,
        gangBalance,
      };
    })
    .get("/checkin-status", async (ctx: any) => {
      const { db, query } = ctx;
      const page = parseInt(query?.page as string) || 1;
      const limit = parseInt(query?.limit as string) || 10;
      const skip = (page - 1) * limit;

      const now = new Date();
      const from = startOfDay(now);
      const to = endOfDay(now);

      const [totalUsers, users] = await Promise.all([
        db.user.count(),
        db.user.findMany({
          skip,
          take: limit,
          select: {
            id: true,
            inGameName: true,
            phoneNumber: true,
            role: true,
            profileImageUrl: true,
            attendances: {
              where: {
                checkInTime: { gte: from, lte: to },
              },
              select: {
                checkInTime: true,
                status: true,
              },
              take: 1,
            },
          },
          orderBy: { inGameName: "asc" },
        }),
      ]);

      const userCheckinStatus = users.map((user: any) => ({
        id: user.id,
        inGameName: user.inGameName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
        hasCheckedIn: user.attendances.length > 0,
        checkInTime: user.attendances[0]?.checkInTime || null,
        status: user.attendances[0]?.status || null,
      }));

      const totalPages = Math.ceil(totalUsers / limit);

      // Calculate summary based on all users (separate query for accurate stats if needed, or just return partial stats?
      // Actually, accurate stats are better. Let's do a quick aggregate for checked-in count if needed,
      // but the previous code summary was based on "users" which was ALL users.
      // For performance with pagination, we might want to avoid fetching ALL users just for a count.
      // Let's do a fast count for summary.
      const checkedInCount = await db.attendanceLog.count({
        where: { checkInTime: { gte: from, lte: to } },
      });

      return {
        users: userCheckinStatus,
        pagination: {
          page,
          limit,
          totalPages,
          totalUsers,
        },
        summary: {
          totalUsers,
          checkedIn: checkedInCount,
          notCheckedIn: totalUsers - checkedInCount,
          checkinRate:
            totalUsers > 0
              ? Math.round((checkedInCount / totalUsers) * 100)
              : 0,
        },
      };
    })
    .post("/weekly-payment", async (ctx: any) => {
      const { db, currentUser, body } = ctx;

      if (currentUser.role !== "ADMIN") {
        throw new Error("เฉพาะ Admin เท่านั้นที่สามารถดำเนินการได้");
      }

      const { amount, reason } = body;
      const now = new Date();

      // ดึงยอดเงินรวมปัจจุบัน
      const currentTotal = await db.globalSetting.findUnique({
        where: { key: "total_money_pool" },
        select: { value: true },
      });

      const currentAmount = currentTotal
        ? parseInt(currentTotal.value) || 0
        : 0;
      const newTotal = currentAmount + amount;

      // อัปเดตหรือสร้าง total money pool
      await db.globalSetting.upsert({
        where: { key: "total_money_pool" },
        update: {
          value: newTotal.toString(),
          description: "ยอดเงินรวมทั้งหมดของระบบ",
        },
        create: {
          key: "total_money_pool",
          value: newTotal.toString(),
          description: "ยอดเงินรวมทั้งหมดของระบบ",
        },
      });

      // สร้าง action log สำหรับการเพิ่มเงินรวม
      await db.actionLog.create({
        data: {
          performerId: currentUser.id,
          actionType: "ADMIN_WEEKLY_PAYMENT",
          details: `เพิ่มเงินรวม: ${amount} บาท (จาก ${currentAmount} เป็น ${newTotal}) - ${
            reason || "ค่าประจำสัปดาห์"
          }`,
          timestamp: now,
        },
      });

      return {
        success: true,
        message: `เพิ่มเงินรวม ${amount} บาท สำเร็จ (ยอดรวม: ${newTotal} บาท)`,
        previousTotal: currentAmount,
        newTotal: newTotal,
        amount: amount,
      };
    })
    .get("/total-money", async (ctx: any) => {
      const { db } = ctx;

      const totalMoney = await db.globalSetting.findUnique({
        where: { key: "total_money_pool" },
        select: { value: true, updatedAt: true },
      });

      return {
        totalMoney: totalMoney ? parseInt(totalMoney.value) || 0 : 0,
        lastUpdated: totalMoney?.updatedAt || null,
      };
    })
    .post("/total-money", async (ctx: any) => {
      const { db, currentUser, body } = ctx;

      if (currentUser.role !== "ADMIN") {
        throw new Error("เฉพาะ Admin เท่านั้นที่สามารถดำเนินการได้");
      }

      const { amount, operation } = body; // operation: 'add' or 'subtract'

      // ดึงยอดเงินรวมปัจจุบัน
      const currentTotal = await db.globalSetting.findUnique({
        where: { key: "total_money_pool" },
        select: { value: true },
      });

      const currentAmount = currentTotal
        ? parseInt(currentTotal.value) || 0
        : 0;
      const newAmount =
        operation === "subtract"
          ? Math.max(0, currentAmount - amount) // ไม่ให้น้อยกว่า 0
          : currentAmount + amount;

      // อัปเดต total money pool
      await db.globalSetting.upsert({
        where: { key: "total_money_pool" },
        update: {
          value: newAmount.toString(),
          description: "ยอดเงินรวมทั้งหมดของระบบ",
        },
        create: {
          key: "total_money_pool",
          value: newAmount.toString(),
          description: "ยอดเงินรวมทั้งหมดของระบบ",
        },
      });

      // สร้าง action log
      await db.actionLog.create({
        data: {
          performerId: currentUser.id,
          actionType: "ADMIN_TOTAL_MONEY_UPDATE",
          details: `${
            operation === "add" ? "เพิ่ม" : "ลด"
          }เงินรวม: ${amount} บาท (จาก ${currentAmount} เป็น ${newAmount})`,
          timestamp: new Date(),
        },
      });

      return {
        success: true,
        previousTotal: currentAmount,
        newTotal: newAmount,
        operation: operation,
        amount: amount,
      };
    })
    .get("/activities", async (ctx: any) => {
      const { db } = ctx;

      // Define sensitive action types to exclude from dashboard
      const EXCLUDED_ACTION_TYPES = [
        "ADMIN_RESET_PASSWORD", // Password reset operations
        "ADMIN_DELETE_USER", // User deletion operations
        "ADMIN_UPDATE_USER_ROLE", // Role changes
        "ADMIN_UPDATE_USER", // User profile updates by admin
        "ADMIN_CREATE_USER", // New user creation
        "USER_CHANGE_PASSWORD", // Password changes
      ];

      // Fetch recent action logs (fetch more to account for filtering)
      const activities = await db.actionLog.findMany({
        take: 30, // Fetch more to ensure we have 10 after filtering
        orderBy: { timestamp: "desc" },
      });

      // Filter out sensitive actions
      const filteredActivities = activities
        .filter((log: any) => !EXCLUDED_ACTION_TYPES.includes(log.actionType))
        .slice(0, 10); // Take only 10 after filtering

      // Get unique performer IDs
      const performerIds = [
        ...new Set(filteredActivities.map((log: any) => log.performerId)),
      ];

      // Fetch user names
      const users = await db.user.findMany({
        where: {
          id: { in: performerIds },
        },
        select: {
          id: true,
          inGameName: true,
        },
      });

      // Map ID to name
      const userMap = users.reduce((acc: any, user: any) => {
        acc[user.id] = user.inGameName;
        return acc;
      }, {});

      return filteredActivities.map((log: any) => ({
        id: log.id,
        action: log.details || log.actionType,
        user: userMap[log.performerId] || "System",
        time: log.timestamp.toISOString(),
        status: "success",
      }));
    });
