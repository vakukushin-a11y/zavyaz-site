import { eq, sql } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getMaxOwnerUserId } from "./owner";

const MAX_API_BASE = "https://botapi.max.ru";
const STATS_LAST_SENT_KEY = "enc_stats_last_sent";
const STATS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

async function sendToMaxUser(token: string, userId: number, text: string): Promise<void> {
  await fetch(`${MAX_API_BASE}/messages?access_token=${token}&user_id=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function collectStats(): Promise<{
  totalUsers: number;
  totalQueries: number;
  users: Array<{ name: string; username?: string; count: number }>;
}> {
  const result = await db.execute<{ key: string; value: string }>(
    sql`SELECT key, value FROM settings WHERE key LIKE ${"enc_daily:%"}`,
  );

  const userCounts = new Map<number, number>();
  for (const row of result.rows) {
    const parts = (row.key as string).split(":");
    if (parts.length !== 3) continue;
    const userId = parseInt(parts[1] as string, 10);
    if (isNaN(userId)) continue;
    userCounts.set(userId, (userCounts.get(userId) ?? 0) + parseInt(row.value as string, 10));
  }

  const users: Array<{ name: string; username?: string; count: number }> = [];
  for (const [userId, count] of userCounts.entries()) {
    const infoRows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, `enc_user:${userId}`));
    let name = `ID ${userId}`;
    let username: string | undefined;
    if (infoRows[0]?.value) {
      try {
        const info = JSON.parse(infoRows[0].value) as { name?: string; username?: string };
        if (info.name) name = info.name;
        if (info.username) username = info.username;
      } catch {
        // ignore parse error
      }
    }
    users.push({ name, username, count });
  }

  users.sort((a, b) => b.count - a.count);
  return {
    totalUsers: users.length,
    totalQueries: users.reduce((s, u) => s + u.count, 0),
    users,
  };
}

async function shouldSend(): Promise<boolean> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, STATS_LAST_SENT_KEY));
  if (!rows[0]?.value) return true;
  return Date.now() - new Date(rows[0].value).getTime() >= STATS_INTERVAL_MS;
}

async function markSent(): Promise<void> {
  const value = new Date().toISOString();
  await db
    .insert(settingsTable)
    .values({ key: STATS_LAST_SENT_KEY, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

export async function sendWeeklyStats(token: string): Promise<void> {
  try {
    const ownerId = await getMaxOwnerUserId();
    if (!ownerId) {
      logger.warn("MAX owner user ID not set — weekly stats skipped");
      return;
    }

    const stats = await collectStats();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) =>
      d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

    const lines: string[] = [
      `📊 Статистика энциклопедии за неделю`,
      `${fmt(weekAgo)} — ${fmt(now)}`,
      ``,
      `👥 Пользователей: ${stats.totalUsers}`,
      `🔢 Запросов всего: ${stats.totalQueries}`,
    ];

    if (stats.users.length > 0) {
      lines.push(``, `📋 По пользователям:`);
      stats.users.slice(0, 25).forEach((u, i) => {
        const handle = u.username ? ` (@${u.username})` : "";
        lines.push(`${i + 1}. ${u.name}${handle} — ${u.count} зап.`);
      });
    } else {
      lines.push(``, `Запросов за неделю не было.`);
    }

    await sendToMaxUser(token, ownerId, lines.join("\n"));
    await markSent();
    logger.info("Weekly encyclopedia stats sent to MAX owner");
  } catch (err) {
    logger.error({ err }, "Failed to send weekly encyclopedia stats");
  }
}

export function startStatsScheduler(token: string): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every hour

  const run = async () => {
    if (await shouldSend()) {
      await sendWeeklyStats(token);
    }
  };

  setTimeout(() => void run(), 30_000);
  setInterval(() => void run(), CHECK_INTERVAL_MS);
  logger.info("Encyclopedia stats scheduler started");
}
