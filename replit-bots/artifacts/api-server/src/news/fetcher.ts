import { createHash } from "crypto";
import RSSParser from "rss-parser";
import { db, knitwearNewsTable, type InsertKnitwearNews } from "@workspace/db";
import { eq, inArray, lt } from "drizzle-orm";
import { openai, CHAT_MODEL } from "../ai/consultant";
import { logger } from "../lib/logger";
import {
  NEWS_SOURCES,
  KNITWEAR_KEYWORDS_RU,
  KNITWEAR_KEYWORDS_EN,
  type NewsSource,
} from "./sources";

interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  enclosure?: { url?: string; type?: string };
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
}

const parser = new RSSParser<Record<string, unknown>, RSSItem>({
  customFields: {
    item: [
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["enclosure", "enclosure"],
    ],
  },
  timeout: 15000,
});

function hashUrl(url: string): string {
  return createHash("sha256")
    .update(url.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/$/, ""))
    .digest("hex")
    .slice(0, 40);
}

function extractImage(item: RSSItem): string | null {
  const enc = item.enclosure;
  if (enc?.url && enc?.type?.startsWith("image/")) return enc.url;
  const mc = item["media:content"];
  if (mc?.$?.url) return mc.$.url;
  const mt = item["media:thumbnail"];
  if (mt?.$?.url) return mt.$.url;
  const content = item.content ?? "";
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match) return match[1] ?? null;
  return null;
}

async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(articleUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KnitwearBot/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < 40000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    await reader.cancel();
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export { fetchOgImage };

function isKnitwearRelevant(title: string, desc: string): boolean {
  const text = `${title} ${desc}`.toLowerCase();
  return (
    KNITWEAR_KEYWORDS_RU.some((kw) => text.includes(kw)) ||
    KNITWEAR_KEYWORDS_EN.some((kw) => text.includes(kw))
  );
}

export async function generateDetailedAnalysis(title: string, summary: string): Promise<string> {
  try {
    const rawContent = [title, summary].filter(Boolean).join("\n\n");
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Ты редактор новостей для трикотажной индустрии. Пиши только по-русски. Перескажи содержание статьи конкретными фактами и деталями: называй конкретные узоры (косы, аранский, жаккард, полосы и т.д.), конкретные цвета и оттенки, виды пряжи и состав (шерсть, кашемир, мохер, акрил, вискоза и т.д.), техники вязания (интарсия, переплетения, фактуры). Пиши как журналист — утвердительными предложениями о том, ЧТО есть в коллекции или статье. ЗАПРЕЩЕНО писать: 'в статье упоминается', 'не указано', 'не описано', 'отсутствуют данные', 'статья акцентирует', 'цветовая палитра включает', 'не указаны материалы'. Если деталей нет — не пиши об их отсутствии, просто опиши то, что есть. Формат: до 5 абзацев, каждый абзац не более 20 слов. Без заголовков, без маркированных списков, только абзацы разделённые пустой строкой.",
        },
        {
          role: "user",
          content: `Статья:\n${rawContent}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.5,
    });
    return resp.choices[0]?.message.content?.trim() ?? summary;
  } catch {
    return summary;
  }
}

async function analyzeWithAI(
  title: string,
  description: string,
  translateTitle: boolean,
): Promise<{ relevance: number; summary: string; trend: string; titleRu: string } | null> {
  try {
    const resp = await openai.chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Ты — аналитик трикотажной и текстильной индустрии. Отвечай строго в JSON.",
        },
        {
          role: "user",
          content: `Оцени статью для системы мониторинга трикотажных тенденций.

Заголовок: ${title}
Описание: ${description.slice(0, 600)}

ВАЖНО: Высокий балл (7–10) ставь ТОЛЬКО если статья напрямую посвящена:
- конкретным трикотажным изделиям (свитер, кардиган, джемпер, пуловер, платье, жилет и т.п.)
- тенденциям и трендам в трикотаже (цвета сезона, фасоны, узоры, вязка)
- пряже, шерсти, кашемиру, мерино, составам трикотажа
- вязанию (спицы, крючок, техники)

Низкий балл (0–3) ставь ВСЕГДА если статья:
- о кроссовках, туфлях, сапогах, ботинках или любой другой обуви
- о сумках, аксессуарах, украшениях (если нет трикотажного контекста)
- о логистике, доставке, цепочках поставок, таможне
- о финансах, инвестициях, акциях, M&A сделках брендов
- о технологиях, IT, искусственном интеллекте (если не о трикотаже напрямую)
- о спортивных брендах (Nike, Adidas, Puma и т.п.) — их кроссовках, экипировке
- о показах мод в целом без упоминания конкретных трикотажных изделий
- о знаменитостях, красных дорожках без трикотажного акцента
- о косметике, парфюмерии, beauty-индустрии
- о ресторанах, еде, путешествиях, недвижимости

Ответь в JSON:
{
  "relevance": <число 0-10>,
  "summary": "<2-4 предложения на русском — краткое содержание>",
  "trend": "<1 предложение на русском — какой тренд в трикотаже отражает статья, или пустая строка если не о трикотаже>",
  "titleRu": "<${translateTitle ? "точный перевод заголовка на русский язык" : "заголовок как есть, без изменений"}>"
}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      relevance?: number;
      summary?: string;
      trend?: string;
      titleRu?: string;
    };
    return {
      relevance: Number(parsed.relevance ?? 0),
      summary: parsed.summary ?? "",
      trend: parsed.trend ?? "",
      titleRu: parsed.titleRu ?? title,
    };
  } catch (err) {
    logger.warn({ err }, "AI analysis failed for article");
    return null;
  }
}

async function fetchSource(source: NewsSource): Promise<RSSItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items ?? []) as RSSItem[];
  } catch (err) {
    logger.warn({ err, source: source.name }, "Failed to fetch RSS source");
    return [];
  }
}

export async function fetchAndStoreNews(): Promise<number> {
  logger.info("Starting knitwear news fetch");
  let totalAdded = 0;

  for (const source of NEWS_SOURCES) {
    const items = await fetchSource(source);
    if (items.length === 0) continue;

    const candidates: {
      item: RSSItem;
      externalId: string;
      source: NewsSource;
    }[] = [];

    for (const item of items) {
      const url = item.link?.trim();
      if (!url || !item.title) continue;

      const externalId = hashUrl(url);
      const existing = await db
        .select({ id: knitwearNewsTable.id })
        .from(knitwearNewsTable)
        .where(eq(knitwearNewsTable.externalId, externalId))
        .limit(1);

      if (existing.length > 0) continue;
      candidates.push({ item, externalId, source });
    }

    logger.info(
      { source: source.name, candidates: candidates.length },
      "Processing new articles",
    );

    for (const { item, externalId, source: src } of candidates) {
      const title = item.title ?? "";
      const desc = item.contentSnippet ?? item.content ?? "";
      const quickMatch = isKnitwearRelevant(title, desc);
      const translateTitle = src.type === "int";

      let relevance = quickMatch ? 5 : 0;
      let summary: string | null = null;
      let trend: string | null = null;
      let storedTitle = title;

      const ai = await analyzeWithAI(title, desc, translateTitle);
      if (ai) {
        relevance = ai.relevance;
        summary = ai.summary || null;
        trend = ai.trend || null;
        if (translateTitle && ai.titleRu) storedTitle = ai.titleRu;
      } else if (!quickMatch) {
        continue;
      }

      if (relevance < 8) continue;

      const pubDate = item.pubDate ? new Date(item.pubDate) : null;
      const imageUrl = extractImage(item) ?? await fetchOgImage(item.link!);
      const detailedAnalysis = await generateDetailedAnalysis(storedTitle, summary ?? trend ?? "");

      const record: InsertKnitwearNews = {
        externalId,
        title: storedTitle,
        summary,
        url: item.link!,
        sourceName: src.name,
        sourceType: src.type,
        imageUrl: imageUrl ?? undefined,
        aiAnalysis: detailedAnalysis || trend,
        relevanceScore: relevance,
        publishedAt: pubDate ?? undefined,
      };

      try {
        await db.insert(knitwearNewsTable).values(record).onConflictDoNothing();
        totalAdded++;
        logger.info({ title, source: src.name, relevance }, "Saved news article");
      } catch (err) {
        logger.warn({ err, title }, "Failed to insert article");
      }

      await new Promise((r) => setTimeout(r, 300));
    }
  }

  logger.info({ totalAdded }, "News fetch complete");
  return totalAdded;
}

export async function deleteOldNews(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const old = await db
      .select({ id: knitwearNewsTable.id })
      .from(knitwearNewsTable)
      .where(lt(knitwearNewsTable.createdAt, cutoff));
    if (old.length === 0) return;
    const ids = old.map((r) => r.id);
    await db.delete(knitwearNewsTable).where(inArray(knitwearNewsTable.id, ids));
    logger.info({ count: old.length }, "Deleted old news articles");
  } catch (err) {
    logger.warn({ err }, "Failed to delete old news");
  }
}
