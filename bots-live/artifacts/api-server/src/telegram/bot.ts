import fs from "node:fs";
import path from "node:path";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import {
  db,
  conversations as conversationsTable,
  messages as messagesTable,
  leadsTable,
  knitwearNewsTable,
  settingsTable,
} from "@workspace/db";
import { fetchOgImage } from "../news/fetcher";
import {
  openai,
  CHAT_MODEL,
  buildSystemPrompt,
  getProductImageFiles,
  extractContacts,
  WELCOME_MESSAGE,
  PRODUCTS_DIR,
  loadKnowledgeBase,
} from "../ai/consultant";
import { getPriceDisplay } from "../data/prices";
import { logger } from "../lib/logger";
import { ADMIN_USERNAME, setAdminChatId, notifyAdminOfLead } from "./notify";

const TELEGRAM_API = "https://api.telegram.org";
const HISTORY_LIMIT = 20;

const ORDER_CATEGORIES = [
  "Кардиганы", "Платья", "Джемперы", "Свитеры",
  "Палантины", "Шарфы и шапки", "Снуды", "Косынки",
  "Пледы", "Туники", "Брюки, кофты и другая одежда",
];

const OWNER_PHONE = "+79222019199";
const OWNER_PHONE_DISPLAY = "+7 922 20 19 19 9";
const DESIGNER_NAME = "Ирина Кукушина";

const ENCYCLOPEDIA_PROMPT = `Ты — «Энциклопедия трикотажа», дружелюбный AI-эксперт по трикотажу.

Твоя задача — помогать пользователям:
• Узнать всё о трикотажных изделиях — джемперы, свитеры, кардиганы, палантины, шарфы, шапки, пледы, платья, туники, снуды, косынки
• Разобраться в составах и свойствах пряжи — шерсть, меринос, кашемир, альпака, ангора, хлопок, акрил, вискоза, полиамид, полиэстер
• Понять историю трикотажных изделий
• Сравнивать изделия и материалы между собой
• Выбирать подходящее изделие по сезону, стилю и уходу
• Узнать правила ухода за трикотажем
• Играть в викторины и мини-тесты по теме трикотажа

СТИЛЬ ОБЩЕНИЯ:
Дружелюбный, экспертный, с лёгким позитивным юмором. Приводи интересные факты и яркие сравнения.
Отвечай развёрнуто — 2–5 абзацев. Используй эмодзи для оформления разделов.

КАТАЛОГ ИЗДЕЛИЙ — всё на заказ, индивидуально:
Изделия: палантины, шарфы, шапки, снуды, косынки, пледы, платья, джемперы, кардиганы, туники, свитеры.

ОГРАНИЧЕНИЕ ТЕМАТИКИ:
Отвечай только на темы: трикотаж, одежда, материалы, составы, уход за изделиями, история одежды, выбор трикотажа.
Если вопрос не по теме — вежливо предложи вернуться к миру трикотажа.`;

// ── Types ────────────────────────────────────────────────────────────────
interface TgUser { id: number; first_name?: string; last_name?: string; username?: string; }
interface TgChat { id: number; }
interface TgMessage { message_id: number; from?: TgUser; chat: TgChat; text?: string; }
interface TgCallbackQuery { id: string; from: TgUser; message?: { chat: TgChat; message_id: number }; data?: string; }
interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallbackQuery; }

type InlineKeyboardButton = { text: string; callback_data: string } | { text: string; url: string };
type InlineKeyboard = { inline_keyboard: InlineKeyboardButton[][] };

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function pluralFires(n: number): string {
  const mod10 = n % 10; const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "огонёк";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "огонька";
  return "огоньков";
}

class TelegramBot {
  private token: string;
  private offset = 0;
  private running = false;
  private chatToConversation = new Map<number, number>();
  private encyclopediaSessions = new Set<number>();

  constructor(token: string) { this.token = token; }

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
      if (!data.ok) { logger.warn({ method, description: data.description }, "TG API error"); return null; }
      return data.result ?? null;
    } catch (err) { logger.error({ err, method }, "TG API fail"); return null; }
  }

  private async sendBotMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: "HTML" };
    if (keyboard) body.reply_markup = keyboard;
    await this.call("sendMessage", body);
  }

  private async answerCallbackQuery(queryId: string): Promise<void> {
    await this.call("answerCallbackQuery", { callback_query_id: queryId });
  }

  private async sendForm(method: string, form: FormData): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as { ok: boolean } | null;
    if (!data?.ok) logger.warn({ method }, "TG media fail");
  }

  private async sendPhotos(chatId: number, files: string[]): Promise<void> {
    const existing = files.filter((f) => fs.existsSync(f)).slice(0, 5);
    if (existing.length === 0) return;
    if (existing.length === 1) {
      const form = new FormData(); form.append("chat_id", String(chatId));
      const buf = fs.readFileSync(existing[0]);
      form.append("photo", new Blob([buf], { type: mimeFor(existing[0]) }), path.basename(existing[0]));
      await this.sendForm("sendPhoto", form); return;
    }
    const form = new FormData(); form.append("chat_id", String(chatId));
    const media = existing.map((_, i) => ({ type: "photo", media: `attach://photo${i}` }));
    form.append("media", JSON.stringify(media));
    existing.forEach((file, i) => {
      const buf = fs.readFileSync(file);
      form.append(`photo${i}`, new Blob([buf], { type: mimeFor(file) }), path.basename(file));
    });
    await this.sendForm("sendMediaGroup", form);
  }

  private async sendPhotoFromUrl(chatId: number, url: string): Promise<void> {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "KnitwearBot/1.0" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const buf = Buffer.from(await res.arrayBuffer());
      const form = new FormData(); form.append("chat_id", String(chatId));
      form.append("photo", new Blob([buf], { type: "image/jpeg" }), "news.jpg");
      await this.sendForm("sendPhoto", form);
    } catch { /* skip */ }
  }

  // ── DB helpers ──────────────────────────────────────────────────────────
  private async getOrCreateConversation(chatId: number, from?: TgUser): Promise<number> {
    const cached = this.chatToConversation.get(chatId);
    if (cached) return cached;
    const title = `Telegram#${chatId}`;
    const existing = await db.select().from(conversationsTable).where(eq(conversationsTable.title, title));
    if (existing.length > 0) { this.chatToConversation.set(chatId, existing[0].id); return existing[0].id; }
    const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
    const [conv] = await db.insert(conversationsTable).values({ title }).returning();
    const handle = from?.username ? `@${from.username}` : "";
    await db.insert(leadsTable).values({ conversationId: conv.id, name: name || from?.username || null, stage: "discovery", preferences: `Источник: Telegram ${handle}`.trim() });
    this.chatToConversation.set(chatId, conv.id);
    return conv.id;
  }

  private async upsertLead(conversationId: number, userText: string): Promise<{ name: string | null; phone: string | null; email: string | null; preferences: string | null } | null> {
    const { phone, email, name } = extractContacts(userText);
    if (!phone && !email) return null;
    const existing = await db.select().from(leadsTable).where(eq(leadsTable.conversationId, conversationId));
    if (existing.length > 0) {
      const prev = existing[0];
      const isNewContact = (!!phone && !prev.phone) || (!!email && !prev.email);
      await db.update(leadsTable).set({ phone: phone ?? prev.phone, email: email ?? prev.email, name: name ?? prev.name, stage: "contact" }).where(eq(leadsTable.conversationId, conversationId));
      if (!isNewContact) return null;
      return { name: name ?? prev.name, phone: phone ?? prev.phone, email: email ?? prev.email, preferences: prev.preferences };
    }
    await db.insert(leadsTable).values({ conversationId, phone, email, name, stage: "contact", preferences: "Источник: Telegram" });
    return { name, phone, email, preferences: "Источник: Telegram" };
  }

  // ── Keyboards ───────────────────────────────────────────────────────────
  private buildMainMenuKeyboard(): InlineKeyboard {
    return {
      inline_keyboard: [
        [{ text: "📋 Выбрать изделие для заказа", callback_data: "menu:order" }],
        [{ text: "🧶 Энциклопедия трикотажа", callback_data: "menu:encyclopedia" }],
        [{ text: "📰 Новости трикотажной моды", callback_data: "menu:news" }],
        [{ text: "📞 Позвонить дизайнеру", callback_data: "menu:contact" }],
        [{ text: "🔥 Нравится", callback_data: "action:like" }],
      ],
    };
  }

  private buildEncyclopediaKeyboard(): InlineKeyboard {
    return {
      inline_keyboard: [
        [{ text: "↩️ Главное меню", callback_data: "menu:main" }],
        [{ text: "📋 Выбрать изделие", callback_data: "menu:order" }],
        [{ text: "🧶 Продолжить вопросы", callback_data: "menu:encyclopedia" }],
        [{ text: "📰 Новости", callback_data: "menu:news" }],
        [{ text: "🔥 Нравится", callback_data: "action:like" }],
      ],
    };
  }

  private buildCategoryKeyboard(): InlineKeyboard {
    const rows: InlineKeyboardButton[][] = [];
    for (let i = 0; i < ORDER_CATEGORIES.length; i += 2) {
      rows.push(ORDER_CATEGORIES.slice(i, i + 2).map((cat) => ({ text: cat, callback_data: `cat:${cat}` })));
    }
    rows.push([{ text: "↩️ Главное меню", callback_data: "menu:main" }]);
    return { inline_keyboard: rows };
  }

  private buildAfterProductKeyboard(): InlineKeyboard {
    return {
      inline_keyboard: [
        [{ text: "↩️ Главное меню", callback_data: "menu:main" }],
        [{ text: "📋 Другое изделие", callback_data: "menu:order" }],
        [{ text: "🧶 Энциклопедия", callback_data: "menu:encyclopedia" }],
        [{ text: "🔥 Нравится", callback_data: "action:like" }],
      ],
    };
  }

  // ── News digest (AI analysis + images like MAX) ─────────────────────────
  private async sendNewsDigest(chatId: number): Promise<void> {
    const NEWS_PER_BATCH = 7;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const excludeTopics = sql`lower(${knitwearNewsTable.title}) NOT SIMILAR TO '%(кроссовки|обувь|sneaker|shoe|logistics|таможн|доставк|инвестиц|косметик|парфюм|ювелир|nike|adidas|puma|gucci|dior|chanel|hermes)%'`;

    let articles = await db.select().from(knitwearNewsTable)
      .where(and(gte(knitwearNewsTable.publishedAt, cutoff), gte(knitwearNewsTable.relevanceScore, 8), excludeTopics))
      .orderBy(desc(knitwearNewsTable.publishedAt)).limit(NEWS_PER_BATCH);

    let isFallback = false;
    if (articles.length === 0) {
      articles = await db.select().from(knitwearNewsTable)
        .where(and(gte(knitwearNewsTable.relevanceScore, 8), excludeTopics))
        .orderBy(desc(knitwearNewsTable.publishedAt)).limit(5);
      isFallback = true;
    }

    if (articles.length === 0) {
      await this.sendBotMessage(chatId, "📰 Свежих новостей пока нет — загляните позже!", this.buildMainMenuKeyboard());
      return;
    }

    const header = isFallback
      ? `📰 Нет свежих новостей за 7 дней. Самые последние из архива (${articles.length}):`
      : `📰 <b>Новости трикотажной индустрии</b> — за 7 дней (${articles.length}):`;
    await this.sendBotMessage(chatId, header);

    for (const article of articles) {
      const date = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
      const source = article.sourceName ? ` • ${article.sourceName}` : "";
      const hdr = [date, source].filter(Boolean).join("");

      const analysis = article.aiAnalysis ?? article.summary ?? "";
      const trimmed = analysis.length > 600 ? analysis.slice(0, 597) + "…" : analysis;
      const parts = [hdr ? `📅 ${hdr}` : null, `<b>${article.title}</b>`, trimmed || null].filter(Boolean).join("\n\n");
      await this.sendBotMessage(chatId, parts);

      const imgUrl = article.imageUrl ?? await fetchOgImage(article.url);
      if (imgUrl) await this.sendPhotoFromUrl(chatId, imgUrl);
    }
    await this.sendBotMessage(chatId, "Это все актуальные новости. Чем ещё могу помочь?", this.buildMainMenuKeyboard());
  }

  // ── Encyclopedia ────────────────────────────────────────────────────────
  private async checkEncyclopediaLimit(userId: number): Promise<boolean> {
    const DAILY_LIMIT = 10;
    const today = new Date().toISOString().slice(0, 10);
    const key = `enc_daily:${userId}:${today}`;
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    const count = parseInt(rows[0]?.value ?? "0", 10);
    if (count >= DAILY_LIMIT) return false;
    await db.insert(settingsTable).values({ key, value: String(count + 1) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(count + 1), updatedAt: new Date() } });
    return true;
  }

  private async sendEncyclopediaIntro(chatId: number, reEnter = false): Promise<void> {
    this.encyclopediaSessions.add(chatId);
    const FACTS = [
      "🐑 Одна овца меринос даёт до 10 кг шерсти в год — этого хватит на 2–3 свитера.",
      "📍 Слово «кардиган» появилось в честь лорда Кардигана — британского генерала Крымской войны 1854 года.",
      "🌿 История вязания насчитывает более 3000 лет — вязаные изделия находили в египетских гробницах!",
      "🦙 Из одной кашемировой козы — всего 150–200 г пряжи в год. Вот почему кашемир такой ценный!",
      "💡 Коко Шанель первой применила трикотаж в haute couture в 1920-х.",
      "🇳🇴 Узор норвежского свитера был уникален для каждой деревни — по нему узнавали, откуда рыбак.",
      "🌊 «Джемпер» — от французского «jupe» (рабочая рубаха моряков XIX века).",
      "❄️ Шерсть согревает даже во влажном состоянии — уникальное свойство среди всех волокон.",
    ];
    const fact = FACTS[Math.floor(Math.random() * FACTS.length)];

    const text = reEnter
      ? "Я расскажу всё о трикотажных изделиях. Задайте следующий вопрос:"
      : [
          "🧶 <b>Энциклопедия трикотажа</b>",
          "Я расскажу вам всё о трикотажных изделиях, пряже и материалах!\n",
          `✨ <b>Факт дня:</b>\n${fact}\n`,
          "<b>Что я умею:</b>\n• Объяснить разницу между джемпером и свитером\n• Рассказать о составах пряжи\n• Дать советы по уходу за трикотажем\n• Рассказать историю любого изделия\n• Помочь выбрать вещь по сезону",
          "<b>Примеры:</b>\n— Что теплее: шерсть или акрил?\n— Как стирать кашемир?\n— Чем кардиган отличается от жакета?\n— Какой состав лучше для зимы?",
          "Просто напишите свой вопрос! 😊",
        ].join("\n\n");

    await this.sendBotMessage(chatId, text, this.buildEncyclopediaKeyboard());
  }

  private async handleEncyclopediaChat(chatId: number, text: string): Promise<void> {
    const allowed = await this.checkEncyclopediaLimit(chatId);
    if (!allowed) {
      await this.sendBotMessage(chatId, "⚠️ Лимит вопросов на сегодня исчерпан. Возвращайтесь завтра!", this.buildMainMenuKeyboard());
      this.encyclopediaSessions.delete(chatId); return;
    }
    const kb = loadKnowledgeBase();
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL, max_tokens: 1200, temperature: 0.75,
        messages: [{ role: "system", content: ENCYCLOPEDIA_PROMPT + (kb ? `\n\n${kb}` : "") }, { role: "user", content: text }],
      });
      const reply = completion.choices[0]?.message?.content ?? "";
      if (reply) await this.sendBotMessage(chatId, reply, this.buildEncyclopediaKeyboard());
    } catch (err) {
      logger.error({ err }, "Encyclopedia AI fail"); await this.sendBotMessage(chatId, "Ошибка. Попробуйте ещё раз.", this.buildMainMenuKeyboard());
    }
  }

  // ── Callback handler ─────────────────────────────────────────────────────
  private async handleCallbackQuery(query: TgCallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    await this.answerCallbackQuery(query.id);
    const payload = query.data ?? "";

    // Main menu
    if (payload === "menu:main") { this.encyclopediaSessions.delete(chatId); await this.sendWelcome(chatId, false); return; }
    if (payload === "menu:news") { this.encyclopediaSessions.delete(chatId); await this.sendNewsDigest(chatId); return; }
    if (payload === "menu:encyclopedia") { const reEnter = this.encyclopediaSessions.has(chatId); await this.sendEncyclopediaIntro(chatId, reEnter); return; }
    if (payload === "menu:contact") {
      this.encyclopediaSessions.delete(chatId);
      await this.sendBotMessage(chatId, `${DESIGNER_NAME} — дизайнер ателье «Завязь»\n\n📞 ${OWNER_PHONE_DISPLAY}`, this.buildMainMenuKeyboard()); return;
    }
    if (payload === "menu:order") { this.encyclopediaSessions.delete(chatId); await this.sendBotMessage(chatId, "Выберите изделие для заказа 👇", this.buildCategoryKeyboard()); return; }

    // Category selection
    if (payload.startsWith("cat:")) {
      const cat = payload.slice("cat:".length);
      if (!ORDER_CATEGORIES.includes(cat)) return;
      const photos = getProductImageFiles(cat);
      if (photos.length > 0) await this.sendPhotos(chatId, photos);
      const priceText = getPriceDisplay(cat) ?? cat;
      await this.sendBotMessage(chatId, `${priceText}\n\nДоступны различные цвета и размеры, согласовываются индивидуально.\n\nЧтобы оформить заказ, позвоните дизайнеру ателье ${DESIGNER_NAME}:\n📞 ${OWNER_PHONE_DISPLAY}`, this.buildAfterProductKeyboard());
      return;
    }

    // Like button
    if (payload === "action:like") {
      await db.execute(sql`INSERT INTO settings (key, value, updated_at) VALUES ('likes_total', '1', NOW()) ON CONFLICT (key) DO UPDATE SET value = (CAST(settings.value AS BIGINT) + 1)::text, updated_at = NOW()`);
      const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "likes_total"));
      const count = parseInt(rows[0]?.value ?? "1", 10);
      await this.sendBotMessage(chatId, `🔥 Спасибо! Уже ${count} ${pluralFires(count)}!`, this.buildMainMenuKeyboard()); return;
    }
  }

  // ── Welcome ──────────────────────────────────────────────────────────────
  private async sendWelcome(chatId: number, isFirstTime = true): Promise<void> {
    const text = isFirstTime ? WELCOME_MESSAGE : "Главное меню:";
    await this.sendBotMessage(chatId, text, this.buildMainMenuKeyboard());
  }

  // ── Message handler ──────────────────────────────────────────────────────
  private async handleMessage(msg: TgMessage): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    const isAdmin = msg.from?.username?.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (isAdmin) await setAdminChatId(chatId);

    const conversationId = await this.getOrCreateConversation(chatId, msg.from);

    if (text === "/start") {
      if (isAdmin) { await this.sendBotMessage(chatId, "✅ Вы подключены как администратор. Сюда будут приходить заявки.", this.buildMainMenuKeyboard()); }
      else { await this.sendWelcome(chatId); }
      return;
    }

    // Encyclopedia session — route to encyclopedia AI
    if (this.encyclopediaSessions.has(chatId)) { await this.handleEncyclopediaChat(chatId, text); return; }

    // Regular AI chat
    await db.insert(messagesTable).values({ conversationId, role: "user", content: text });

    const newLead = await this.upsertLead(conversationId, text);
    if (newLead) {
      const handle = msg.from?.username ? `@${msg.from.username}` : "";
      void notifyAdminOfLead({ source: "Telegram", name: newLead.name, phone: newLead.phone, email: newLead.email, preferences: [newLead.preferences, handle].filter(Boolean).join(" "), message: text });
    }

    const history = await db.select().from(messagesTable).where(eq(messagesTable.conversationId, conversationId)).orderBy(messagesTable.createdAt);
    const recent = history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let answer: string;
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL, max_completion_tokens: 8192,
        messages: [{ role: "system", content: buildSystemPrompt() }, ...recent],
      });
      answer = completion.choices[0]?.message?.content ?? "";
    } catch (err) { logger.error({ err }, "AI fail"); await this.sendBotMessage(chatId, "Ошибка. Попробуйте ещё раз.", this.buildMainMenuKeyboard()); return; }

    const cleaned = answer.replace(/\[\[PHOTO:[^\]]+\]\]/g, "").trim();
    await db.insert(messagesTable).values({ conversationId, role: "assistant", content: cleaned });
    if (cleaned) await this.sendBotMessage(chatId, cleaned, this.buildMainMenuKeyboard());
  }

  // ── Long polling ─────────────────────────────────────────────────────────
  private async poll(): Promise<void> {
    while (this.running) {
      const updates = await this.call<TgUpdate[]>("getUpdates", { offset: this.offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
      if (!updates) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      for (const update of updates) {
        this.offset = update.update_id + 1;
        if (update.message) { try { await this.handleMessage(update.message); } catch (err) { logger.error({ err }, "TG msg fail"); } }
        if (update.callback_query) { try { await this.handleCallbackQuery(update.callback_query); } catch (err) { logger.error({ err }, "TG callback fail"); } }
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.call("deleteWebhook", { drop_pending_updates: false });
    const me = await this.call<{ username?: string }>("getMe", {});
    if (!me) { logger.error("TG token invalid"); return; }
    this.running = true;
    logger.info({ username: me.username }, "Telegram bot started");
    void this.poll();
  }
}

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) { logger.info("TELEGRAM_BOT_TOKEN not set"); return; }
  const bot = new TelegramBot(token);
  void bot.start();
}
