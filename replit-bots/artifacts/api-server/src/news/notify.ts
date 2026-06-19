import { db, knitwearNewsTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import { getAdminChatId } from "../telegram/notify";
import { logger } from "../lib/logger";

const TELEGRAM_API = "https://api.telegram.org";

export async function notifyAdminOfTopNews(addedCount: number): Promise<void> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return;

    const chatId = await getAdminChatId();
    if (!chatId) return;

    const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const items = await db
      .select()
      .from(knitwearNewsTable)
      .where(gte(knitwearNewsTable.createdAt, since))
      .orderBy(desc(knitwearNewsTable.relevanceScore))
      .limit(5);

    if (items.length === 0) return;

    const header = `📰 *Новости трикотажной индустрии* — ${addedCount} новых материалов\n\n`;
    const parts = items.map((n, i) => {
      const date = n.publishedAt
        ? new Date(n.publishedAt).toLocaleDateString("ru-RU")
        : "";
      const emoji = n.sourceType === "ru" ? "🇷🇺" : "🌍";
      const lines = [
        `${i + 1}. ${emoji} *${escMd(n.title)}*`,
        n.summary ? escMd(n.summary.slice(0, 200)) : "",
        `📌 ${escMd(n.sourceName)}${date ? ` · ${date}` : ""}`,
        `🔗 ${n.url}`,
      ].filter(Boolean);
      return lines.join("\n");
    });

    const text = header + parts.join("\n\n");

    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    logger.warn({ err }, "Failed to send news notification to admin");
  }
}

function escMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
