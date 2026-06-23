import { createHash } from "crypto";
import RSSParser from "rss-parser";
import { db, knitwearNewsTable, type InsertKnitwearNews } from "";
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
  logger.info("OG image fetching is disabled");
  return null;
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
  logger.info("Detailed analysis is disabled");
  return summary;
}

async function analyzeWithAI(
  title: string,
  description: string,
  translateTitle: boolean,
): Promise<{ relevance: number; summary: string; trend: string; titleRu: string } | null> {
  logger.info("AI analysis is disabled");
  return null;
}

async function fetchSource(source: NewsSource): Promise<RSSItem[]> {
  logger.info("RSS source fetching is disabled");
  return [];
}

export async function fetchAndStoreNews(): Promise<number> {
  logger.info("News fetching is disabled");
  return 0;
}

export async function deleteOldNews(): Promise<void> {
  logger.info("Old news deletion is disabled");
  return;
}
