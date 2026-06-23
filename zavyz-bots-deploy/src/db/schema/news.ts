import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const knitwearNewsTable = pgTable("knitwear_news", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary"),
  url: text("url").notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull().default("int"),
  imageUrl: text("image_url"),
  aiAnalysis: text("ai_analysis"),
  relevanceScore: integer("relevance_score").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertKnitwearNewsSchema = createInsertSchema(knitwearNewsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertKnitwearNews = z.infer<typeof insertKnitwearNewsSchema>;
export type KnitwearNews = typeof knitwearNewsTable.$inferSelect;
