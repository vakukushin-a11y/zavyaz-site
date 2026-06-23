import { Router } from "express";
import { db, knitwearNewsTable } from "";
import { desc, gte, eq, and, count, sql } from "drizzle-orm";
import { runNewsJob } from "../news/scheduler";
import { getLastRefresh } from "../news/scheduler";
import { openai, CHAT_MODEL } from "../ai/consultant";
import { fetchOgImage, generateDetailedAnalysis } from "../news/fetcher";
import { logger } from "../lib/logger";
import { isNull, or } from "drizzle-orm";

const newsRouter = Router();

newsRouter.get("/news", async (req, res) => {
  try {
    const type = (req.query["type"] as string) ?? "all";
    const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
    const offset = Number(req.query["offset"] ?? 0);

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const excludeTopics = sql`lower(${knitwearNewsTable.title}) NOT SIMILAR TO '%(кроссовки|кроссовок|кеды|туфли|сапоги|ботинки|обувь|обуви|sneaker|sneakers|shoe|shoes|footwear|logistics|logistic|supply chain|таможн|доставк|инвестиц|косметик|парфюм|украшени|ювелир|nike|adidas|puma|reebok|new balance|under armour|gucci|prada|chanel|dior|hermes|burberry|louis vuitton|versace|balenciaga|fendi)%'`;

    const baseCondition =
      type === "ru"
        ? and(gte(knitwearNewsTable.publishedAt, cutoff), eq(knitwearNewsTable.sourceType, "ru"), gte(knitwearNewsTable.relevanceScore, 8), excludeTopics)
        : type === "int"
          ? and(gte(knitwearNewsTable.publishedAt, cutoff), eq(knitwearNewsTable.sourceType, "int"), gte(knitwearNewsTable.relevanceScore, 8), excludeTopics)
          : and(gte(knitwearNewsTable.publishedAt, cutoff), gte(knitwearNewsTable.relevanceScore, 8), excludeTopics);

    const [items, totalRows, lastRefresh] = await Promise.all([
      db
        .select()
        .from(knitwearNewsTable)
        .where(baseCondition)
        .orderBy(desc(knitwearNewsTable.publishedAt), desc(knitwearNewsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: count() })
        .from(knitwearNewsTable)
        .where(baseCondition),
      getLastRefresh(),
    ]);

    res.json({
      items,
      total: totalRows[0]?.value ?? 0,
      lastRefreshedAt: lastRefresh,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch news");
    res.status(500).json({ error: "Ошибка загрузки новостей" });
  }
});

newsRouter.post("/news/refresh", async (req, res) => {
  res.status(403).json({ error: "Парсинг новостей отключён" });
});

// Enrich existing articles: fetch missing images + generate detailed AI analysis
newsRouter.post("/news/enrich", async (req, res) => {
  res.status(403).json({ error: "Парсинг новостей отключён" });
});

// Translate existing English-title articles to Russian (batch mode)
newsRouter.post("/news/translate-existing", async (req, res) => {
  res.status(403).json({ error: "Парсинг новостей отключён" });
});

export default newsRouter;
