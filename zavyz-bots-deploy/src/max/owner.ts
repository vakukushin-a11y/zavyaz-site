import { eq } from "drizzle-orm";
import { db, settingsTable } from "";
import { logger } from "../lib/logger";

const MAX_OWNER_PROFILE_URL =
  "https://max.ru/u/f9LHodD0cOJHlRgTVJLCJOey0VThf3qgeSh40hZHPJuQxcBf6ExnvG5A6Ic";
const MAX_OWNER_USER_ID_KEY = "max_owner_user_id";

async function resolveMaxProfileUserId(): Promise<number | null> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(MAX_OWNER_PROFILE_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ZavyzBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const patterns = [
      /"user_id"\s*:\s*(\d+)/,
      /data-user-id="(\d+)"/,
      /"userId"\s*:\s*(\d+)/,
      /"id"\s*:\s*(\d{5,})/,
      /userId[=:\s]+(\d+)/,
    ];
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m?.[1]) return parseInt(m[1], 10);
    }
    logger.warn("MAX owner user ID not found in profile page HTML");
    return null;
  } catch (err) {
    logger.warn({ err }, "Failed to resolve MAX owner profile URL");
    return null;
  }
}

export async function getMaxOwnerUserId(): Promise<number | null> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, MAX_OWNER_USER_ID_KEY));
  if (rows[0]?.value) return parseInt(rows[0].value, 10);

  const resolved = await resolveMaxProfileUserId();
  if (resolved) await setMaxOwnerUserId(resolved);
  return resolved;
}

export async function setMaxOwnerUserId(userId: number): Promise<void> {
  const value = String(userId);
  await db
    .insert(settingsTable)
    .values({ key: MAX_OWNER_USER_ID_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  logger.info({ userId }, "MAX owner user ID stored");
}
