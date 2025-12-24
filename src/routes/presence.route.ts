import { Elysia, t } from "elysia";

type ActiveUser = {
  id: string;
  name: string;
  role: string;
  lastSeen: number;
};

// In-memory store for active users
// Note: In a production multi-server environment, use Redis instead.
const activeUsers = new Map<string, ActiveUser>();

const TIMEOUT_MS = 30 * 1000; // 30 seconds timeout

function pruneUsers() {
  const now = Date.now();
  for (const [id, user] of activeUsers.entries()) {
    if (now - user.lastSeen > TIMEOUT_MS) {
      activeUsers.delete(id);
    }
  }
}

export const presenceRoutes = (app: any) =>
  app
    .post(
      "/heartbeat",
      ({ body }: any) => {
        const { id, name, role } = body;

        // Update user status
        activeUsers.set(id, {
          id,
          name,
          role,
          lastSeen: Date.now(),
        });

        // Cleanup old users
        pruneUsers();

        // Return current active users list
        return Array.from(activeUsers.values()).map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
        }));
      },
      {
        body: t.Object({
          id: t.String(),
          name: t.String(),
          role: t.String(),
        }),
      }
    )
    .get("/active", () => {
      pruneUsers();
      return Array.from(activeUsers.values()).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }));
    });
