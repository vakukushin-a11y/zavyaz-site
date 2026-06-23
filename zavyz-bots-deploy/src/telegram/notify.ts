import { eq } from "drizzle-orm";
import { db, settingsTable } from "";
import { logger } from "../lib/logger";

const TELEGRAM_API = "https://api.telegram.org";
const ADMIN_CHAT_ID_KEY = "admin_telegram_chat_id";

// Telegram username (without @) of the person who should receive all leads.
export const ADMIN_USERNAME = "kian2702";

export async function getAdminChatId(): Promise<string | null> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, ADMIN_CHAT_ID_KEY));
  return rows[0]?.value ?? null;
}

export async function setAdminChatId(chatId: number | string): Promise<void> {
  const value = String(chatId);
  const existing = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, ADMIN_CHAT_ID_KEY));

  // Already set to this value — skip the write to avoid log spam on every
  // message from the admin.
  if (existing.length > 0 && existing[0].value === value) return;

  // Atomic upsert keyed on the primary key, so concurrent first writes cannot
  // collide.
  await db
    .insert(settingsTable)
    .values({ key: ADMIN_CHAT_ID_KEY, value })
    .onConflictDoUpdate({
      target: settingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  logger.info({ chatId: value }, "Admin Telegram chat id registered");
}

export interface LeadNotification {
  source: "Сайт" | "Telegram" | "MAX";
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  preferences?: string | null;
  message?: string | null;
}

/**
 * Forwards a newly captured lead to the admin Telegram chat. Failures are
 * logged but never thrown, so they cannot break the chat flow.
 */
export async function notifyAdminOfLead(lead: LeadNotification): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      logger.warn("New lead but TELEGRAM_BOT_TOKEN not set — cannot notify admin");
      return;
    }

    const chatId = await getAdminChatId();
    if (!chatId) {
      logger.warn(
        { admin: ADMIN_USERNAME },
        "New lead but admin chat id unknown — admin must message the bot first",
      );
      return;
    }

    const lines = [
      "🧶 Новая заявка с zavyz.ru",
      `Источник: ${lead.source}`,
      lead.name ? `Имя: ${lead.name}` : null,
      lead.phone ? `Телефон: ${lead.phone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.preferences ? `Пожелания: ${lead.preferences}` : null,
      lead.message ? `Сообщение: ${lead.message}` : null,
    ].filter(Boolean);

    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!data?.ok) {
      logger.warn(
        { description: data?.description },
        "Failed to send admin lead notification",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to notify admin of new lead");
  }
}
