import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { fetchAndStoreNews, deleteOldNews } from "./fetcher";
import { notifyAdminOfTopNews } from "./notify";

const LAST_REFRESH_KEY = "news_last_refresh";

/** Returns ms until next 01:00 Moscow time (UTC+3). */
function msUntilNext01MSK(): number {
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const nowMsk = nowUtc + MSK_OFFSET_MS;
  const mskDate = new Date(nowMsk);
  // Next 01:00 MSK
  const next = new Date(nowMsk);
  next.setUTCHours(1, 0, 0, 0);
  if (next.getTime() <= mskDate.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - mskDate.getTime();
}

export async function getLastRefresh(): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, LAST_REFRESH_KEY));
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function setLastRefresh(): Promise<void> {
  const value = new Date().toISOString();
  await db
    .insert(settingsTable)
    .values({ key: LAST_REFRESH_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function runNewsJob(notify = true): Promise<number> {
  try {
    await deleteOldNews();
    const added = await fetchAndStoreNews();
    await setLastRefresh();
    if (notify && added > 0) {
      await notifyAdminOfTopNews(added);
    }
    return added;
  } catch (err) {
    logger.error({ err }, "News job failed");
    return 0;
  }
}

export function startNewsScheduler(): void {
  const scheduleNext = () => {
    const delay = msUntilNext01MSK();
    const hours = Math.round(delay / 1000 / 60 / 60 * 10) / 10;
    logger.info({ nextRunInHours: hours }, "News fetch scheduled for 01:00 MSK");
    setTimeout(async () => {
      logger.info("Running daily news fetch (01:00 MSK)");
      await runNewsJob();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}
