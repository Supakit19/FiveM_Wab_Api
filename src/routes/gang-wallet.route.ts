import { Elysia, t } from "elysia";
import { jwtGuard } from "../middlewares/auth.middleware";
import { logAction } from "../services/actionLog";

export const gangWalletRoutes = (app: any) =>
  app
    .use(jwtGuard(["ADMIN"]))
    // Get gang wallet balance and transactions
    .get("/admin/gang-wallet", async ({ db }: any) => {
      try {
        // Get current balance from the most recent transaction
        const lastTx = await db.gangTransaction.findFirst({
          orderBy: { createdAt: "desc" },
          select: { balanceAfter: true },
        });

        const balance = lastTx?.balanceAfter || 0;

        // Get recent transactions
        const transactions = await db.gangTransaction.findMany({
          orderBy: { createdAt: "desc" },
          take: 50, // Last 50 transactions
          include: {
            createdBy: {
              select: {
                inGameName: true,
                phoneNumber: true,
              },
            },
          },
        });

        return {
          balance,
          transactions: transactions.map((tx: any) => ({
            id: tx.id,
            type: tx.type,
            amount: tx.amount,
            description: tx.description,
            createdAt: tx.createdAt,
            createdBy: tx.createdBy?.inGameName || "System",
          })),
        };
      } catch (error) {
        console.error("Failed to fetch gang wallet:", error);
        throw new Error("Failed to fetch gang wallet data");
      }
    })
    // Add new transaction
    .post(
      "/admin/gang-wallet/transaction",
      async ({ db, currentUser, body }: any) => {
        const { type, amount, description } = body;

        // Start a transaction
        return db.$transaction(async (prisma: any) => {
          // Get current balance
          const lastTx = await prisma.gangTransaction.findFirst({
            orderBy: { createdAt: "desc" },
            select: { balanceAfter: true },
          });

          const currentBalance = lastTx?.balanceAfter || 0;
          const newBalance =
            type === "INCOME"
              ? currentBalance + amount
              : currentBalance - amount;

          if (newBalance < 0) {
            throw new Error("ยอดเงินไม่เพียงพอ");
          }

          // Create new transaction
          const transaction = await prisma.gangTransaction.create({
            data: {
              type,
              amount,
              description,
              balanceBefore: currentBalance,
              balanceAfter: newBalance,
              createdBy: { connect: { id: currentUser.id } },
            },
          });

          // Log the action
          await logAction(
            prisma,
            currentUser.id,
            "GANG_WALLET_TRANSACTION",
            `${
              type === "INCOME" ? "เพิ่ม" : "ถอน"
            }เงินกองกลาง ${amount} บาท - ${description}. ยอดใหม่: ${newBalance}`
          );

          return {
            success: true,
            newBalance,
            transaction,
          };
        });
      },
      {
        body: t.Object({
          type: t.Union([t.Literal("INCOME"), t.Literal("EXPENSE")]),
          amount: t.Number({ minimum: 1 }),
          description: t.String({ minLength: 1 }),
        }),
      }
    );
