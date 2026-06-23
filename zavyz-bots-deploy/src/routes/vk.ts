import { Router } from "express";
import RSSParser from "rss-parser";
import { db, settingsTable } from "";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const vkRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────────
interface AiNewsItem {
  title: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  sourceName: string;
  lang: string;
  publishedAt: string | null;
}

// ── In-memory news cache (15 min TTL) ────────────────────────────────────────
interface CachedNews {
  items: AiNewsItem[];
  fetchedAt: number;
}
const newsCache = new Map<string, CachedNews>();
const CACHE_TTL_MS = 15 * 60 * 1000;

// ── AI news RSS sources ───────────────────────────────────────────────────────
const AI_NEWS_SOURCES = [
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", lang: "en" },
  { name: "VentureBeat AI", url: "https://venturebeat.com/ai/feed/", lang: "en" },
  { name: "The Verge AI", url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml", lang: "en" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", lang: "en" },
  { name: "Wired AI", url: "https://www.wired.com/feed/tag/artificial-intelligence/rss", lang: "en" },
  { name: "Habr ML", url: "https://habr.com/ru/rss/hub/machine_learning/posts/?fl=ru", lang: "ru" },
  { name: "Habr AI", url: "https://habr.com/ru/rss/hub/artificial_intelligence/posts/?fl=ru", lang: "ru" },
  { name: "VC.ru ИИ", url: "https://vc.ru/rss/tag/ai", lang: "ru" },
];

interface RSSEntry {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  enclosure?: { url?: string; type?: string };
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
}

const parser = new RSSParser<Record<string, unknown>, RSSEntry>({
  customFields: {
    item: [
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["enclosure", "enclosure"],
    ],
  },
  timeout: 12000,
});

function extractImage(item: RSSEntry): string | null {
  const enc = item.enclosure;
  if (enc?.url && enc?.type?.startsWith("image/")) return enc.url;
  const mc = item["media:content"];
  if (mc?.$?.url) return mc.$.url;
  const mt = item["media:thumbnail"];
  if (mt?.$?.url) return mt.$.url;
  return null;
}

// ── GET /api/vk/settings ─────────────────────────────────────────────────────
vkRouter.get("/vk/settings", async (req, res) => {
  try {
    const [tokenRows, groupRows, appIdRows] = await Promise.all([
      db.select().from(settingsTable).where(eq(settingsTable.key, "vk_token")),
      db.select().from(settingsTable).where(eq(settingsTable.key, "vk_group_id")),
      db.select().from(settingsTable).where(eq(settingsTable.key, "vk_app_id")),
    ]);
    res.json({
      token: tokenRows[0]?.value ?? "",
      groupId: groupRows[0]?.value ?? "",
      appId: appIdRows[0]?.value ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "GET /api/vk/settings failed");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ── POST /api/vk/settings ────────────────────────────────────────────────────
vkRouter.post("/vk/settings", async (req, res) => {
  try {
    const { token, groupId, appId } = req.body as { token?: string; groupId?: string; appId?: string };

    const upserts: Promise<unknown>[] = [];

    if (token !== undefined) {
      upserts.push(
        db.insert(settingsTable)
          .values({ key: "vk_token", value: String(token).trim() })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(token).trim(), updatedAt: new Date() } })
      );
    }
    if (groupId !== undefined) {
      upserts.push(
        db.insert(settingsTable)
          .values({ key: "vk_group_id", value: String(groupId).trim() })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(groupId).trim(), updatedAt: new Date() } })
      );
    }
    if (appId !== undefined) {
      upserts.push(
        db.insert(settingsTable)
          .values({ key: "vk_app_id", value: String(appId).trim() })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(appId).trim(), updatedAt: new Date() } })
      );
    }

    await Promise.all(upserts);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "POST /api/vk/settings failed");
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

async function fetchAllAiNews(langFilter: string): Promise<AiNewsItem[]> {
  logger.info("AI news fetching is disabled");
  return [];
}

// ── GET /api/vk/ai-news ──────────────────────────────────────────────────────
vkRouter.get("/vk/ai-news", async (req, res) => {
  res.status(403).json({ error: "Парсинг новостей отключён" });
});

// ── POST /api/vk/publish ─────────────────────────────────────────────────────
vkRouter.post("/vk/publish", async (req, res) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message?.trim()) {
      res.status(400).json({ error: "Текст поста не может быть пустым" });
      return;
    }

    const tokenRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "vk_token"));
    const groupRows = await db.select().from(settingsTable).where(eq(settingsTable.key, "vk_group_id"));

    const token = tokenRows[0]?.value?.trim();
    const groupId = groupRows[0]?.value?.trim();

    if (!token) {
      res.status(400).json({ error: "VK токен не настроен. Заполните настройки ВКонтакте." });
      return;
    }
    if (!groupId) {
      res.status(400).json({ error: "ID сообщества не настроен. Заполните настройки ВКонтакте." });
      return;
    }

    // owner_id for community must be negative
    const rawId = groupId.replace(/^-/, "");
    const ownerId = `-${rawId}`;

    const params = new URLSearchParams({
      owner_id: ownerId,
      message: message.trim(),
      access_token: token,
      v: "5.199",
      from_group: "1",
    });

    const resp = await fetch(`https://api.vk.com/method/wall.post?${params.toString()}`, {
      method: "POST",
    });
    const data = (await resp.json()) as { response?: { post_id?: number }; error?: { error_msg?: string; error_code?: number } };

    if (data.error) {
      const raw = data.error.error_msg ?? "Ошибка VK API";
      req.log.warn({ vkError: data.error }, "VK wall.post error");
      // Specific hint for group-token restriction
      const isGroupAuthError =
        raw.toLowerCase().includes("group auth") ||
        raw.toLowerCase().includes("unavailable with group") ||
        data.error.error_code === 15;
      const isInvalidToken = data.error.error_code === 4;
      const msg = isGroupAuthError
        ? "Групповой токен не поддерживает публикацию. Создайте Standalone-приложение ВКонтакте, получите пользовательский токен с разрешением wall и обновите настройки."
        : isInvalidToken
        ? "Токен недействителен (ошибка 4). Убедитесь, что вы скопировали токен полностью из адресной строки после нажатия на ссылку в Настройках ВК. Токен выглядит как длинная строка после access_token= и до следующего &."
        : raw;
      res.status(400).json({ error: msg, vkCode: data.error.error_code });
      return;
    }

    res.json({ ok: true, postId: data.response?.post_id });
  } catch (err) {
    req.log.error({ err }, "POST /api/vk/publish failed");
    res.status(500).json({ error: "Ошибка сервера при публикации" });
  }
});

// ── Cache warm-up (called on server start) ───────────────────────────────────
export function warmVkNewsCache(): void {
  // Парсинг новостей отключён
}

export default vkRouter;
