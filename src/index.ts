import "dotenv/config";
import { Elysia } from "elysia";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { staticPlugin } from "@elysiajs/static";
import { authRoutes } from "./routes/auth.route";
import { announcementRoutes } from "./routes/announcement.route";
import { attendanceRoutes } from "./routes/attendance.route";
import { inventoryRoutes } from "./routes/inventory.route";
import { logRoutes } from "./routes/log.route";
import { adminRoutes } from "./routes/admin.route";
import { dashboardRoutes } from "./routes/dashboard.route";
import { meRoutes } from "./routes/me.route";
import { gangWalletRoutes } from "./routes/gang-wallet.route";
import { presenceRoutes } from "./routes/presence.route";
// ===== ตรวจ env =====
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

// ===== Prisma MariaDB Adapter =====
const dbUrl = new URL(process.env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: dbUrl.port ? Number(dbUrl.port) : 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

// ===== Elysia App =====
const app = new Elysia()
  .decorate("db", prisma)
  // Static files MUST come first to bypass authentication
  .use(
    staticPlugin({
      assets: "public",
      prefix: "/public",
    })
  )
  .use(cors())
  .use(swagger())
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET,
      exp: "1h",
    })
  )
  .get("/", () => "API is running")
  .group("/auth", authRoutes)
  .group("/announcements", announcementRoutes as any)
  .group("/attendance", attendanceRoutes as any)
  .group("/inventory", inventoryRoutes as any)
  .group("/logs", logRoutes as any)
  .group("/admin", adminRoutes as any)
  .group("/dashboard", dashboardRoutes as any)
  .group("/me", meRoutes as any)
  .group("/presence", presenceRoutes as any)
  .use(gangWalletRoutes as any)
  .listen(
    {
      port: Number(process.env.PORT || 3000),
      hostname: "0.0.0.0",
    },
    ({ hostname, port }) => {
      console.log(`🦊 Elysia is running at http://${hostname}:${port}`);
    }
  );

export type App = typeof app;
