import fs from "node:fs";
import path from "node:path";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import {
  db,
  conversations as conversationsTable,
  messages as messagesTable,
  leadsTable,
  knitwearNewsTable,
} from "@workspace/db";
import {
  openai,
  CHAT_MODEL,
  buildSystemPrompt,
  getProductImageFiles,
  getImageFilesFromText,
  extractContacts,
  WELCOME_MESSAGE,
  createMarkerRegex,
} from "../ai/consultant";
import { getPriceDisplay } from "../data/prices";
import { logger } from "../lib/logger";
import { ADMIN_USERNAME, setAdminChatId, notifyAdminOfLead } from "./notify";

const TELEGRAM_API = "https://api.telegram.org";
const HISTORY_LIMIT = 20;

// ── Order form constants ──────────────────────────────────────────────────────
const ORDER_CATEGORIES = [
  "Кардиганы", "Платья", "Джемперы", "Свитеры",
  "Палантины", "Шарфы и шапки", "Снуды", "Косынки",
  "Пледы", "Туники", "Брюки, кофты и другая одежда",
];
const SIZED_ORDER_CATS = new Set(["Кардиганы", "Платья", "Джемперы", "Свитеры"]);
const CONTACT_BUTTON = "📞 Связаться с дизайнером ателье «Завязь»";
const NEWS_BUTTON = "📰 Новости трикотажной индустрии";
const ENCYCLOPEDIA_BUTTON = "🧶 Энциклопедия трикотажа";
const OWNER_PHONE = "+79222019199";
const OWNER_PHONE_DISPLAY = "+7 922 20 19 199";
const ORDER_SIZES = ["S", "M", "L", "XL", "Oversize"];

// Logo path — try several candidates relative to cwd
const LOGO_PATH = (() => {
  const candidates = [
    path.resolve(process.cwd(), "../../zavyz-chat/public/welcome/logo.png"),
    path.resolve(process.cwd(), "../zavyz-chat/public/welcome/logo.png"),
    path.resolve(process.cwd(), "public/welcome/logo.png"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
})();

interface OrderSession {
  step: "category" | "size" | "name" | "contact";
  category?: string;
  size?: string;
  clientName?: string;
}

// ── Telegram API types ────────────────────────────────────────────────────────
interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgChat {
  id: number;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: { chat: TgChat; message_id: number };
  data?: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

type InlineKeyboardButton = { text: string; callback_data: string } | { text: string; url: string };
type InlineKeyboard = { inline_keyboard: InlineKeyboardButton[][] };
type ReplyKeyboard = {
  keyboard: { text: string }[][];
  resize_keyboard: boolean;
  is_persistent: boolean;
};

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

class TelegramBot {
  private token: string;
  private offset = 0;
  private running = false;
  private chatToConversation = new Map<number, number>();
  private orderSessions = new Map<number, OrderSession>();

  constructor(token: string) {
    this.token = token;
  }

  private async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
      if (!data.ok) {
        logger.warn({ method, description: data.description }, "Telegram API error");
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      logger.error({ err, method }, "Telegram API request failed");
      return null;
    }
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text });
  }

  private async sendMessageWithKeyboard(
    chatId: number,
    text: string,
    keyboard: InlineKeyboard,
  ): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text, reply_markup: keyboard });
  }

  private async sendMessageWithReplyKeyboard(
    chatId: number,
    text: string,
    keyboard: ReplyKeyboard,
  ): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text, reply_markup: keyboard });
  }

  private async sendBotMessage(
    chatId: number,
    text: string,
    replyMarkup?: InlineKeyboard | ReplyKeyboard,
  ): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await this.call("sendMessage", body);
  }

  private async answerCallbackQuery(queryId: string): Promise<void> {
    await this.call("answerCallbackQuery", { callback_query_id: queryId });
  }

  private async sendChatAction(chatId: number, action: string): Promise<void> {
    await this.call("sendChatAction", { chat_id: chatId, action });
  }

  private async sendForm(method: string, form: FormData): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}/bot${this.token}/${method}`, {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; description?: string }
      | null;
    if (!data?.ok) {
      logger.warn({ method, status: res.status, description: data?.description }, "Telegram media send failed");
    }
  }

  private async sendPhotos(chatId: number, files: string[]): Promise<void> {
    const existing = files.filter((f) => fs.existsSync(f)).slice(0, 10);
    if (existing.length === 0) return;
    try {
      if (existing.length === 1) {
        const form = new FormData();
        form.append("chat_id", String(chatId));
        const buf = fs.readFileSync(existing[0]);
        form.append("photo", new Blob([buf], { type: mimeFor(existing[0]) }), path.basename(existing[0]));
        await this.sendForm("sendPhoto", form);
        return;
      }
      const form = new FormData();
      form.append("chat_id", String(chatId));
      const media = existing.map((_f, i) => ({ type: "photo", media: `attach://photo${i}` }));
      form.append("media", JSON.stringify(media));
      existing.forEach((file, i) => {
        const buf = fs.readFileSync(file);
        form.append(`photo${i}`, new Blob([buf], { type: mimeFor(file) }), path.basename(file));
      });
      await this.sendForm("sendMediaGroup", form);
    } catch (err) {
      logger.error({ err }, "Failed to send Telegram photos");
    }
  }

  private async getOrCreateConversation(chatId: number, from?: TgUser): Promise<number> {
    const cached = this.chatToConversation.get(chatId);
    if (cached) return cached;

    const title = `Telegram#${chatId}`;
    const existing = await db.select().from(conversationsTable).where(eq(conversationsTable.title, title));
    if (existing.length > 0) {
      this.chatToConversation.set(chatId, existing[0].id);
      return existing[0].id;
    }

    const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
    const [conv] = await db.insert(conversationsTable).values({ title }).returning();
    const handle = from?.username ? `@${from.username}` : "";
    await db.insert(leadsTable).values({
      conversationId: conv.id,
      name: name || from?.username || null,
      stage: "discovery",
      preferences: `Источник: Telegram ${handle}`.trim(),
    });

    this.chatToConversation.set(chatId, conv.id);
    return conv.id;
  }

  private async upsertLead(
    conversationId: number,
    userText: string,
  ): Promise<{ name: string | null; phone: string | null; email: string | null; preferences: string | null } | null> {
    const { phone, email, name } = extractContacts(userText);
    if (!phone && !email) return null;

    const existing = await db.select().from(leadsTable).where(eq(leadsTable.conversationId, conversationId));
    if (existing.length > 0) {
      const prev = existing[0];
      const isNewContact = (!!phone && !prev.phone) || (!!email && !prev.email);
      await db
        .update(leadsTable)
        .set({ phone: phone ?? prev.phone, email: email ?? prev.email, name: name ?? prev.name, stage: "contact" })
        .where(eq(leadsTable.conversationId, conversationId));
      if (!isNewContact) return null;
      return { name: name ?? prev.name, phone: phone ?? prev.phone, email: email ?? prev.email, preferences: prev.preferences };
    }

    await db.insert(leadsTable).values({ conversationId, phone, email, name, stage: "contact", preferences: "Источник: Telegram" });
    return { name, phone, email, preferences: "Источник: Telegram" };
  }

  // ── Keyboards ───────────────────────────────────────────────────────────────

  private buildAdminKeyboard(): ReplyKeyboard {
    return {
      keyboard: [
        [{ text: ENCYCLOPEDIA_BUTTON }],
        [{ text: NEWS_BUTTON }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
  }

  // ── Order form helpers ──────────────────────────────────────────────────────

  private buildCategoryReplyKeyboard(): ReplyKeyboard {
    const rows: { text: string }[][] = [];
    for (let i = 0; i < ORDER_CATEGORIES.length; i += 2) {
      rows.push(ORDER_CATEGORIES.slice(i, i + 2).map((cat) => ({ text: cat })));
    }
    rows.push([{ text: ENCYCLOPEDIA_BUTTON }]);
    rows.push([{ text: NEWS_BUTTON }]);
    rows.push([{ text: CONTACT_BUTTON }]);
    return { keyboard: rows, resize_keyboard: true, is_persistent: true };
  }

  private buildSizeKeyboard(): InlineKeyboard {
    return {
      inline_keyboard: [
        ORDER_SIZES.slice(0, 3).map((s) => ({ text: s, callback_data: `order_sz:${s}` })),
        ORDER_SIZES.slice(3).map((s) => ({ text: s, callback_data: `order_sz:${s}` })),
      ],
    };
  }

  /** Show categories via persistent reply keyboard */
  private async showCategoryMenu(chatId: number): Promise<void> {
    this.orderSessions.set(chatId, { step: "category" });
    await this.sendBotMessage(
      chatId,
      "Выберите категорию изделия из меню ниже 👇",
      this.buildCategoryReplyKeyboard(),
    );
  }

  private async finishOrderForm(
    chatId: number,
    conversationId: number,
    contactValue: string,
    from?: TgUser,
  ): Promise<void> {
    const session = this.orderSessions.get(chatId);
    if (!session) return;
    this.orderSessions.delete(chatId);

    const { category, size, clientName } = session;
    const handle = from?.username ? `@${from.username}` : "";

    const prefParts = [
      clientName ? `Имя: ${clientName}` : null,
      `Изделие: ${category}`,
      size ? `Размер: ${size}` : null,
      `Источник: Telegram${handle ? " " + handle : ""}`,
    ].filter(Boolean);
    const preferences = prefParts.join(", ");

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactValue);
    const email = isEmail ? contactValue : null;
    const phone = isEmail ? null : contactValue;
    const nameToSave = clientName ?? from?.first_name ?? null;

    await db.insert(leadsTable).values({
      conversationId,
      name: nameToSave,
      phone,
      email,
      preferences,
      stage: "order_form",
    });

    void notifyAdminOfLead({
      source: "Telegram",
      name: nameToSave,
      phone,
      email,
      preferences,
    });

    await this.sendBotMessage(
      chatId,
      "✅ Заявка принята!\n\nМы свяжемся с вами в ближайшее время.\n\nЧтобы оформить ещё одну заявку — выберите категорию из меню ниже 👇",
      this.buildCategoryReplyKeyboard(),
    );
  }

  // ── News digest ─────────────────────────────────────────────────────────────

  private async sendNewsDigest(chatId: number): Promise<void> {
    const NEWS_PER_BATCH = 7;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const excludeTopics = sql`lower(${knitwearNewsTable.title}) NOT SIMILAR TO '%(кроссовки|кроссовок|кеды|туфли|сапоги|ботинки|обувь|обуви|sneaker|sneakers|shoe|shoes|footwear|logistics|logistic|supply chain|таможн|доставк|инвестиц|косметик|парфюм|украшени|ювелир|nike|adidas|puma|reebok|new balance|under armour|gucci|prada|chanel|dior|hermes|burberry|louis vuitton|versace|balenciaga|fendi)%'`;
    const articles = await db
      .select()
      .from(knitwearNewsTable)
      .where(
        and(
          gte(knitwearNewsTable.publishedAt, cutoff),
          gte(knitwearNewsTable.relevanceScore, 8),
          excludeTopics,
        ),
      )
      .orderBy(desc(knitwearNewsTable.publishedAt))
      .limit(NEWS_PER_BATCH);

    if (articles.length === 0) {
      await this.sendBotMessage(chatId, "📰 Свежих новостей о трикотаже пока нет — загляните позже!");
      return;
    }

    await this.sendBotMessage(chatId, `📰 *Новости трикотажной индустрии* — свежее за 7 дней (${articles.length} материалов):`);

    for (const article of articles) {
      const date = article.publishedAt
        ? new Date(article.publishedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
        : "";
      const source = article.sourceName ? ` • ${article.sourceName}` : "";
      const header = [date, source].filter(Boolean).join("");

      const body = article.aiAnalysis ?? article.summary ?? "";
      const bodyTrimmed = body.length > 600 ? body.slice(0, 597) + "…" : body;

      const parts = [
        header ? `📅 ${header}` : null,
        `*${article.title}*`,
        bodyTrimmed || null,
      ].filter(Boolean).join("\n\n");

      await this.call("sendMessage", {
        chat_id: chatId,
        text: parts,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
    }
  }

  // ── Encyclopedia intro ───────────────────────────────────────────────────────

  private async sendEncyclopediaIntro(chatId: number): Promise<void> {
    const FACTS = [
      "🐑 Одна овца меринос даёт до 10 кг шерсти в год — этого хватит на 2–3 свитера.",
      "📍 Слово «кардиган» появилось в честь лорда Кардигана — британского генерала Крымской войны 1854 года.",
      "🌿 История вязания насчитывает более 3000 лет — вязаные изделия находили в египетских гробницах!",
      "🦙 Из одной кашемировой козы — всего 150–200 г пряжи в год. Вот почему кашемир такой ценный!",
      "💡 Коко Шанель первой применила трикотаж в haute couture в 1920-х, произведя революцию в моде.",
      "🇳🇴 Узор норвежского свитера был уникален для каждой деревни — по нему узнавали, откуда рыбак.",
      "🌊 «Джемпер» — от французского «jupe» (рабочая рубаха английских моряков XIX века).",
      "❄️ Шерсть согревает даже во влажном состоянии — уникальное свойство среди всех волокон.",
    ];
    const fact = FACTS[Math.floor(Math.random() * FACTS.length)];

    const intro = [
      "🧶 *Энциклопедия трикотажа*",
      "Я расскажу вам всё о трикотажных изделиях, пряже и материалах!\n",
      `✨ *Факт дня:*\n${fact}\n`,
      "*Что я умею:*\n• Объяснить разницу между джемпером и свитером\n• Рассказать о составах пряжи (шерсть, акрил, вискоза, кашемир…)\n• Дать советы по уходу за трикотажем\n• Рассказать историю любого изделия\n• Помочь выбрать подходящую вещь по сезону",
      "*Примеры вопросов:*\n— Что теплее: шерсть или акрил?\n— Как стирать кашемир?\n— Чем кардиган отличается от жакета?\n— Расскажи про палантин\n— Какой состав лучше для зимы?",
      "Просто напишите свой вопрос — отвечу с удовольствием! 😊",
    ].join("\n\n");

    await this.call("sendMessage", {
      chat_id: chatId,
      text: intro,
      parse_mode: "Markdown",
    });
  }

  // ── Callback query handler ──────────────────────────────────────────────────

  private async handleCallbackQuery(query: TgCallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    await this.answerCallbackQuery(query.id);

    const data = query.data ?? "";

    if (data === "show_categories") {
      await this.showCategoryMenu(chatId);
      return;
    }

    const session = this.orderSessions.get(chatId);

    if (data.startsWith("order_sz:") && session?.step === "size") {
      session.size = data.slice("order_sz:".length);
      session.step = "name";
      await this.sendBotMessage(
        chatId,
        `Размер: ${session.size} ✓\n\nВведите ваше имя (или напишите «пропустить»):`,
      );
      return;
    }
  }

  // ── Main message handler ────────────────────────────────────────────────────

  private async handleMessage(msg: TgMessage): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    const isAdmin = msg.from?.username?.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (isAdmin) await setAdminChatId(chatId);

    const conversationId = await this.getOrCreateConversation(chatId, msg.from);

    // /start — show welcome + categories
    if (text === "/start") {
      if (isAdmin) {
        await this.sendBotMessage(
          chatId,
          "✅ Готово! Вы будете получать сюда все заявки с сайта и из бота — телефоны, email и пожелания клиентов.",
          this.buildAdminKeyboard(),
        );
      } else {
        await this.sendBotMessage(chatId, WELCOME_MESSAGE);
        await this.showCategoryMenu(chatId);
      }
      return;
    }

    // Handle contact button
    if (text === CONTACT_BUTTON) {
      await this.sendBotMessage(
        chatId,
        `Ирина Кукушина — хозяйка ателье «Завязь»\n\n📞 ${OWNER_PHONE_DISPLAY}\n\nНажмите на номер, чтобы позвонить.`,
      );
      return;
    }

    // Handle news button
    if (text === NEWS_BUTTON) {
      await this.sendNewsDigest(chatId);
      return;
    }

    // Handle encyclopedia button
    if (text === ENCYCLOPEDIA_BUTTON) {
      await this.sendEncyclopediaIntro(chatId);
      return;
    }

    // Handle category tap from persistent reply keyboard
    const isCategory = ORDER_CATEGORIES.includes(text);
    if (isCategory) {
      const session: OrderSession = { step: "category", category: text };
      this.orderSessions.set(chatId, session);

      const photos = getProductImageFiles(text);
      if (photos.length > 0) {
        await this.sendPhotos(chatId, photos);
        const priceText = getPriceDisplay(text);
        await this.sendBotMessage(
          chatId,
          `${priceText}\n\nДоступны различные цвета. Цвета согласовываются по телефону при заказе.`,
        );
      }

      if (SIZED_ORDER_CATS.has(text)) {
        session.step = "size";
        const sizeList = ORDER_SIZES.join(", ");
        await this.sendBotMessage(
          chatId,
          `Категория: ${text}\nДоступные размеры: ${sizeList}\n\nВыберите желаемый размер:`,
          this.buildSizeKeyboard(),
        );
      } else {
        session.step = "name";
        await this.sendBotMessage(chatId, `Категория: ${text}\n\nВведите ваше имя (или напишите «пропустить»):`);
      }
      return;
    }

    // Handle order form text steps
    const session = this.orderSessions.get(chatId);
    if (session) {
      if (session.step === "category" || session.step === "size") {
        await this.sendBotMessage(chatId, "Пожалуйста, используйте кнопки меню 👇");
        return;
      }
      if (session.step === "name") {
        const lc = text.toLowerCase();
        session.clientName = lc === "пропустить" ? undefined : text;
        session.step = "contact";
        await this.sendBotMessage(
          chatId,
          "Укажите контактные данные: номер телефона, email или ваш адрес в Telegram (@username):",
        );
        return;
      }
      if (session.step === "contact") {
        await this.finishOrderForm(chatId, conversationId, text, msg.from);
        return;
      }
    }

    // ── Normal AI chat ────────────────────────────────────────────────────────
    await this.sendChatAction(chatId, "typing");

    await db.insert(messagesTable).values({ conversationId, role: "user", content: text });

    const newLead = await this.upsertLead(conversationId, text);
    if (newLead) {
      const handle = msg.from?.username ? `@${msg.from.username}` : "";
      void notifyAdminOfLead({
        source: "Telegram",
        name: newLead.name,
        phone: newLead.phone,
        email: newLead.email,
        preferences: [newLead.preferences, handle].filter(Boolean).join(" "),
        message: text,
      });
    }

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    const recent = history.slice(-HISTORY_LIMIT).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let answer: string;
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        max_completion_tokens: 8192,
        messages: [{ role: "system", content: buildSystemPrompt() }, ...recent],
      });
      answer = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      logger.error({ err }, "OpenAI completion failed for Telegram");
      await this.sendBotMessage(chatId, "Извините, произошла ошибка. Попробуйте ещё раз чуть позже.");
      return;
    }

    const photoFiles: string[] = [];
    const markerRegex = createMarkerRegex();
    let match: RegExpExecArray | null;
    while ((match = markerRegex.exec(answer)) !== null) {
      for (const f of getProductImageFiles(match[1])) {
        if (!photoFiles.includes(f)) photoFiles.push(f);
      }
    }
    const cleaned = answer.replace(createMarkerRegex(), "").trim();
    if (photoFiles.length === 0) {
      for (const f of getImageFilesFromText(cleaned)) {
        if (!photoFiles.includes(f)) photoFiles.push(f);
      }
    }
    const filesToSend = photoFiles.slice(0, 5);

    logger.info({ hasMarkers: photoFiles.length > 0, photoCount: filesToSend.length, chatId }, "Telegram photo resolution");

    await db.insert(messagesTable).values({ conversationId, role: "assistant", content: cleaned });
    if (cleaned) await this.sendBotMessage(chatId, cleaned);
    if (filesToSend.length > 0) await this.sendPhotos(chatId, filesToSend);
  }

  // ── Long polling ──────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    while (this.running) {
      const updates = await this.call<TgUpdate[]>("getUpdates", {
        offset: this.offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
      });
      if (!updates) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const update of updates) {
        this.offset = update.update_id + 1;
        if (update.message) {
          try { await this.handleMessage(update.message); }
          catch (err) { logger.error({ err }, "Failed to handle Telegram message"); }
        }
        if (update.callback_query) {
          try { await this.handleCallbackQuery(update.callback_query); }
          catch (err) { logger.error({ err }, "Failed to handle Telegram callback query"); }
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.call("deleteWebhook", { drop_pending_updates: false });
    const me = await this.call<{ username?: string }>("getMe", {});
    if (!me) { logger.error("Telegram bot token invalid — bot not started"); return; }
    this.running = true;
    logger.info({ username: me.username }, "Telegram bot started (long polling)");
    void this.poll();
  }
}

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) { logger.info("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled"); return; }
  const bot = new TelegramBot(token);
  void bot.start();
}
