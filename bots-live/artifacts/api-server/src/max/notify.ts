import { logger } from "../lib/logger";
import { getMaxOwnerUserId } from "./owner";

const MAX_API = "https://platform-api.max.ru";

export interface MaxLeadNotification {
  source?: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  preferences?: string | null;
}

export async function notifyMaxOwnerOfLead(lead: MaxLeadNotification): Promise<void> {
  try {
    const token = process.env.MAX_BOT_TOKEN?.trim();
    if (!token) {
      logger.warn("MAX_BOT_TOKEN not set — MAX lead notification skipped");
      return;
    }

    const ownerId = await getMaxOwnerUserId();
    if (!ownerId) {
      logger.warn("MAX owner user ID not set — MAX lead notification skipped");
      return;
    }

    const lines = [
      `🧶 Новая заявка — ${lead.source ?? "zavyz.ru"}`,
      lead.name ? `Имя: ${lead.name}` : null,
      lead.phone ? `Телефон: ${lead.phone}` : null,
      lead.email ? `Email: ${lead.email}` : null,
      lead.preferences ? `Пожелания: ${lead.preferences}` : null,
    ].filter(Boolean).join("\n");

    const url = new URL(`${MAX_API}/messages`);
    url.searchParams.set("user_id", String(ownerId));

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text.slice(0, 300) }, "MAX lead notification failed");
    }
  } catch (err) {
    logger.error({ err }, "Failed to notify MAX owner of new lead");
  }
}
