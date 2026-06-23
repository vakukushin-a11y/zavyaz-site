import { Router } from "express";
import { db, knitwearNewsTable } from "@workspace/db";
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
  try {
    const added = await runNewsJob(true);
    res.json({ added, message: `Добавлено ${added} новых материалов` });
  } catch (err) {
    req.log.error({ err }, "News refresh failed");
    res.status(500).json({ error: "Ошибка обновления новостей" });
  }
});

// Enrich existing articles: fetch missing images + generate detailed AI analysis
newsRouter.post("/news/enrich", async (req, res) => {
  try {
    const force = req.query["force"] === "true";
    const articles = await db
      .select()
      .from(knitwearNewsTable)
      .orderBy(desc(knitwearNewsTable.publishedAt))
      .limit(50);

    let enriched = 0;

    for (const article of articles) {
      const needsImage = !article.imageUrl;
      const needsAnalysis = force || !article.aiAnalysis || article.aiAnalysis.length < 100 || !article.aiAnalysis.includes("\n");

      if (!needsImage && !needsAnalysis) continue;

      const updates: Record<string, unknown> = {};

      if (needsImage) {
        const imgUrl = await fetchOgImage(article.url);
        if (imgUrl) updates.imageUrl = imgUrl;
      }

      if (needsAnalysis) {
        const raw = [article.title, article.summary ?? article.aiAnalysis ?? ""].filter(Boolean).join("\n\n");
        const analysis = await generateDetailedAnalysis(article.title, raw);
        if (analysis && analysis.length > 50) updates.aiAnalysis = analysis;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(knitwearNewsTable)
          .set({
            imageUrl: (updates.imageUrl as string | undefined) ?? article.imageUrl ?? undefined,
            aiAnalysis: (updates.aiAnalysis as string | undefined) ?? article.aiAnalysis ?? undefined,
          })
          .where(eq(knitwearNewsTable.id, article.id));
        enriched++;
        logger.info({ id: article.id, title: article.title.slice(0, 50) }, "Article enriched");
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    res.json({ enriched, message: `Обогащено ${enriched} статей` });
  } catch (err) {
    req.log.error({ err }, "News enrich failed");
    res.status(500).json({ error: "Ошибка обогащения" });
  }
});

// Translate existing English-title articles to Russian (batch mode)
newsRouter.post("/news/translate-existing", async (req, res) => {
  const BATCH_SIZE = 20;

  try {
    const articles = await db
      .select({ id: knitwearNewsTable.id, title: knitwearNewsTable.title })
      .from(knitwearNewsTable)
      .where(eq(knitwearNewsTable.sourceType, "int"));

    // Only articles with no Cyrillic in title
    const needsTranslation = articles.filter(
      (a) => !/[а-яёА-ЯЁ]/.test(a.title),
    );

    let translated = 0;

    for (let i = 0; i < needsTranslation.length; i += BATCH_SIZE) {
      const batch = needsTranslation.slice(i, i + BATCH_SIZE);
      const numbered = batch.map((a, idx) => `${idx + 1}. ${a.title}`).join("\n");

      try {
        const resp = await openai.chat.completions.create({
          model: CHAT_MODEL,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Переводи заголовки новостей на русский язык. Отвечай строго в JSON.",
            },
            {
              role: "user",
              content: `Переведи заголовки на русский. Сохрани нумерацию:\n\n${numbered}\n\nОтвет: {"translations": ["перевод 1", "перевод 2", ...]}`,
            },
          ],
        });

        const raw = resp.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as { translations?: string[] };
        const translations = parsed.translations ?? [];

        for (let j = 0; j < batch.length; j++) {
          const titleRu = translations[j];
          if (!titleRu) continue;
          await db
            .update(knitwearNewsTable)
            .set({ title: titleRu })
            .where(eq(knitwearNewsTable.id, batch[j]!.id));
          translated++;
        }
        logger.info({ batch: i / BATCH_SIZE + 1, translated }, "Batch translated");
      } catch (err) {
        logger.warn({ err, batchStart: i }, "Batch translation failed");
      }
    }

    res.json({ translated, message: `Переведено ${translated} заголовков` });
  } catch (err) {
    req.log.error({ err }, "Translation job failed");
    res.status(500).json({ error: "Ошибка перевода" });
  }
});

export default newsRouter;
