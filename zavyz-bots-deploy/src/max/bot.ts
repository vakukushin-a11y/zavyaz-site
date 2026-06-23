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
} from "";
import { fetchOgImage } from "../news/fetcher";
import { getMaxOwnerUserId, setMaxOwnerUserId } from "./owner";
import {
  openai,
  CHAT_MODEL,
  buildSystemPrompt,
  extractContacts,
  WELCOME_MESSAGE,
  getProductImageFiles,
  PRODUCTS_DIR,
  loadKnowledgeBase,
} from "../ai/consultant";
import { getPriceDisplay } from "../data/prices";
import { logger } from "../lib/logger";
import { ADMIN_USERNAME, setAdminChatId, notifyAdminOfLead } from "../telegram/notify";

const MAX_API = "https://platform-api.max.ru";
const HISTORY_LIMIT = 20;

// ── Order form constants ──────────────────────────────────────────────────────
const ORDER_CATEGORIES = [
  "Кардиганы", "Платья", "Джемперы", "Свитеры",
  "Палантины", "Шарфы и шапки", "Снуды", "Косынки",
  "Пледы", "Туники", "Брюки, кофты и другая одежда",
];

const OWNER_PHONE = "+79222019199";
const OWNER_PHONE_DISPLAY = "+7 922 201 91 99";
const DESIGNER_NAME = "Ирина Кукушина";

// ── MAX API types ──────────────────────────────────────────────────────────────
interface MaxUser {
  user_id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
  is_bot?: boolean;
}

interface MaxMessage {
  sender?: MaxUser;
  recipient?: { user_id?: number; chat_id?: number };
  body?: { text?: string };
  timestamp?: number;
}

interface MaxCallback {
  id: string;
  user: MaxUser;
  payload?: string;
  timestamp?: number;
}

interface MaxUpdate {
  update_type: string;
  timestamp: number;
  message?: MaxMessage;
  callback?: MaxCallback;
  user?: MaxUser;
  chat_id?: number;
}

interface MaxUpdatesResponse {
  updates: MaxUpdate[];
  marker?: number;
}

type ButtonRow = { type: "callback"; text: string; payload: string }[]
  | { type: "link"; text: string; url: string }[];

interface InlineKeyboard {
  type: "inline_keyboard";
  payload: { buttons: ButtonRow[] };
}

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
Пример: "Если шерсть — это зимнее одеяло природы, то вискоза больше похожа на летний кондиционер 😊"
Отвечай развёрнуто — 2–5 абзацев. Используй эмодзи для оформления разделов.

СОСТАВЫ ПРЯЖИ ДЛЯ АТЕЛЬЕ ЗАВЯЗЬ:
— Полушерсть: 50% акрил + 50% шерсть — оптимальный баланс тепла и практичности
— Хлопок: 50% хлопок + 50% акрил — лёгкость и гипоаллергенность
— Вискоза — мягкость, блеск, «летний» материал
— Акрил 100% — самый доступный, лёгкий уход

ОГРАНИЧЕНИЕ ТЕМАТИКИ:
Отвечай только на темы: трикотаж, одежда, материалы, составы, уход за изделиями, история одежды, выбор трикотажа.
Если вопрос не по теме — вежливо: "Я специализируюсь на трикотажных изделиях и материалах. Давайте вернёмся к миру свитеров, кардиганов и уютного трикотажа 😊"

КАТАЛОГ ИЗДЕЛИЙ — всё на заказ, индивидуально:
Изделия: палантины, шарфы, шапки, снуды, косынки, пледы, платья, джемперы, кардиганы, туники, свитеры.
Можешь рекомендовать изделия из каталога и рассказывать об их особенностях.`;

function pluralFires(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "огонёк";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "огонька";
  return "огоньков";
}

class MaxBot {
  private token: string;
  private marker: number | null = null;
  private running = false;
  private userToConversation = new Map<number, number>();
  private encyclopediaSessions = new Set<number>();

  constructor(token: string) {
    this.token = token;
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async get<T = unknown>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
    const url = new URL(`${MAX_API}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: this.token },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn({ path, status: res.status, body: text.slice(0, 300) }, "MAX API GET error");
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      logger.error({ err, path }, "MAX API GET request failed");
      return null;
    }
  }

  private async post<T = unknown>(path: string, query: Record<string, string | number>, body: Record<string, unknown>): Promise<T | null> {
    const url = new URL(`${MAX_API}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: this.token, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn({ path, status: res.status, body: text.slice(0, 300) }, "MAX API POST error");
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      logger.error({ err, path }, "MAX API POST request failed");
      return null;
    }
  }

  // ── Image sending ─────────────────────────────────────────────────────────────

  private async sendForm(method: string, form: FormData): Promise<void> {
    const url = `${MAX_API}${method}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.token },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.warn({ method, status: res.status, body: text.slice(0, 300) }, "MAX media fail");
      }
    } catch (err) {
      logger.error({ err, method }, "MAX media request failed");
    }
  }

  private mimeFor(file: string): string {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    return "image/jpeg";
  }

  /** Send up to maxCount product photos directly from files. */
  private async sendPhotos(userId: number, files: string[], maxCount = 3): Promise<void> {
    console.log(`[MAX sendPhotos] Trying to send ${files.length} files:`, files);
    const existing = files.filter((f) => {
      const exists = fs.existsSync(f);
      console.log(`[MAX sendPhotos] File ${f} exists: ${exists}`);
      return exists;
    }).slice(0, maxCount);
    if (existing.length === 0) {
      console.log(`[MAX sendPhotos] No existing files to send`);
      return;
    }

    for (const filePath of existing) {
      const form = new FormData();
      form.append("user_id", String(userId));
      const buf = fs.readFileSync(filePath);
      const blob = new Blob([buf], { type: this.mimeFor(filePath) });
      form.append("photo", blob, path.basename(filePath));
      console.log(`[MAX sendPhotos] Sending file: ${filePath}, size: ${buf.length}`);
      await this.sendForm("/messages", form);
    }
  }

  // ── Send helpers ────────────────────────────────────────────────────────────

  private async sendMessage(userId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    const body: Record<string, unknown> = { user_id: userId, text };
    if (keyboard) body.inline_keyboard = keyboard;
    await this.post("/messages", {}, body);
  }

  // ── Keyboards ───────────────────────────────────────────────────────────────

  private buildMainMenuKeyboard(): InlineKeyboard {
    return {
      type: "inline_keyboard",
      payload: {
        buttons: [
          [{ type: "callback", text: "📋 Выбрать изделие для заказа", payload: "menu:order" }],
          [{ type: "callback", text: "🧶 Энциклопедия", payload: "menu:encyclopedia" }],
          [{ type: "callback", text: "📰 Новости", payload: "menu:news" }],
          [{ type: "callback", text: "📞 Позвонить дизайнеру", payload: "menu:contact" }],
          [{ type: "callback", text: "🔥", payload: "action:like" }],
        ],
      },
    };
  }

  private buildEncyclopediaKeyboard(): InlineKeyboard {
    return {
      type: "inline_keyboard",
      payload: {
        buttons: [
          [{ type: "callback", text: "↩️ Главное меню", payload: "menu:main" }],
          [{ type: "callback", text: "📋 Выбрать изделие для заказа", payload: "menu:order" }],
          [{ type: "callback", text: "🧶 Продолжить вопросы", payload: "menu:encyclopedia" }],
          [{ type: "callback", text: "📰 Новости", payload: "menu:news" }],
          [{ type: "callback", text: "📞 Позвонить дизайнеру", payload: "menu:contact" }],
          [{ type: "callback", text: "🔥", payload: "action:like" }],
        ],
      },
    };
  }

  private buildCategoryKeyboard(): InlineKeyboard {
    const buttons: ButtonRow[] = [];
    for (let i = 0; i < ORDER_CATEGORIES.length; i += 2) {
      const row = ORDER_CATEGORIES.slice(i, i + 2).map((cat) => ({
        type: "callback" as const,
        text: cat,
        payload: `cat:${cat}`,
      }));
      buttons.push(row);
    }
    buttons.push([{ type: "callback", text: "↩️ Главное меню", payload: "menu:main" }]);
    return { type: "inline_keyboard", payload: { buttons } };
  }

  private buildAfterProductKeyboard(): InlineKeyboard {
    return {
      type: "inline_keyboard",
      payload: {
        buttons: [
          [{ type: "callback", text: "↩️ Главное меню", payload: "menu:main" }],
          [{ type: "callback", text: "📋 Выбрать другое изделие", payload: "menu:order" }],
          [{ type: "callback", text: "🧶 Энциклопедия", payload: "menu:encyclopedia" }],
          [{ type: "callback", text: "📰 Новости", payload: "menu:news" }],
          [{ type: "callback", text: "🔥", payload: "action:like" }],
        ],
      },
    };
  }

  // ── DB helpers ──────────────────────────────────────────────────────────────

  private async getOrCreateConversation(userId: number, user?: MaxUser): Promise<number> {
    const cached = this.userToConversation.get(userId);
    if (cached) return cached;

    const title = `MAX#${userId}`;
    const existing = await db.select().from(conversationsTable).where(eq(conversationsTable.title, title));
    if (existing.length > 0) {
      this.userToConversation.set(userId, existing[0].id);
      return existing[0].id;
    }

    const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
    const [conv] = await db.insert(conversationsTable).values({ title }).returning();
    const handle = user?.username ? `@${user.username}` : "";
    await db.insert(leadsTable).values({
      conversationId: conv.id,
      name: name || user?.username || null,
      stage: "discovery",
      preferences: `Источник: MAX ${handle}`.trim(),
    });

    this.userToConversation.set(userId, conv.id);
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

    await db.insert(leadsTable).values({ conversationId, phone, email, name, stage: "contact", preferences: "Источник: MAX" });
    return { name, phone, email, preferences: "Источник: MAX" };
  }

  // ── Feature handlers ─────────────────────────────────────────────────────────

  private async sendNewsDigest(userId: number): Promise<void> {
    await this.sendMessage(userId, "📰 Раздел новостей временно недоступен.", this.buildMainMenuKeyboard());
  }

  private async sendEncyclopediaIntro(userId: number, reEnter = false): Promise<void> {
    this.encyclopediaSessions.add(userId);
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
      "🧶 Энциклопедия трикотажа",
      "Я расскажу вам всё о трикотажных изделиях, пряже и материалах!\n",
      `✨ Факт дня:\n${fact}\n`,
      "Что я умею:\n• Объяснить разницу между джемпером и свитером\n• Рассказать о составах пряжи (шерсть, акрил, вискоза, кашемир…)\n• Дать советы по уходу за трикотажем\n• Рассказать историю любого изделия\n• Помочь выбрать подходящую вещь по сезону",
      "Примеры вопросов:\n— Что теплее: шерсть или акрил?\n— Как стирать кашемир?\n— Чем кардиган отличается от жакета?\n— Расскажи про палантин\n— Какой состав лучше для зимы?",
      "Просто напишите свой вопрос — отвечу с удовольствием! 😊",
    ].join("\n\n");

    await this.sendMessage(userId, reEnter ? "Я расскажу всё о трикотажных изделиях. Задайте следующий вопрос" : intro, this.buildEncyclopediaKeyboard());
  }

  private getPublicDomain(): string {
    return process.env.PUBLIC_DOMAIN || "localhost";
  }

  private async sendLogoThenMenu(userId: number, menuText: string): Promise<void> {
    const domain = this.getPublicDomain();
    if (domain === "localhost") {
      await this.sendMessage(userId, menuText, this.buildMainMenuKeyboard());
      return;
    }
    const logoUrl = `https://${domain}/welcome/logo.png`;
    await this.post("/messages", { user_id: userId }, {
      attachments: [{ type: "image", payload: { url: logoUrl } }],
    });
    await this.sendMessage(userId, menuText, this.buildMainMenuKeyboard());
  }

  private async sendWelcome(userId: number): Promise<void> {
    await this.sendLogoThenMenu(userId, WELCOME_MESSAGE);
  }

  private async notifyMaxOwnerOfLead(lead: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    preferences?: string | null;
    maxHandle?: string;
  }): Promise<void> {
    try {
      const ownerId = await getMaxOwnerUserId();
      if (!ownerId) {
        logger.warn("MAX owner user ID not set — lead notification skipped");
        return;
      }
      const lines = [
        "🧶 Новая заявка — zavyz.ru",
        lead.name ? `Имя: ${lead.name}` : null,
        lead.phone ? `Телефон: ${lead.phone}` : null,
        lead.email ? `Email: ${lead.email}` : null,
        lead.preferences ? `Пожелания: ${lead.preferences}` : null,
        lead.maxHandle ? `MAX: ${lead.maxHandle}` : null,
      ].filter(Boolean).join("\n");
      await this.post("/messages", { user_id: ownerId }, { text: lines });
    } catch (err) {
      logger.error({ err }, "Failed to notify MAX owner of new lead");
    }
  }

  // ── AI chat ────────────────────────────────────────────────────────────────

  private async handleAiChat(userId: number, conversationId: number, text: string, user?: MaxUser): Promise<void> {
    await db.insert(messagesTable).values({ conversationId, role: "user", content: text });

    const newLead = await this.upsertLead(conversationId, text);
    if (newLead) {
      void notifyAdminOfLead({
        source: "MAX",
        name: newLead.name,
        phone: newLead.phone,
        email: newLead.email,
        preferences: [newLead.preferences, user?.username ? `@${user.username}` : ""].filter(Boolean).join(" "),
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
      logger.error({ err }, "OpenAI completion failed for MAX");
      await this.sendMessage(userId, "Извините, произошла ошибка. Попробуйте ещё раз чуть позже.", this.buildMainMenuKeyboard());
      return;
    }

    // Strip photo markers (not supported in MAX v1)
    const cleaned = answer.replace(/\[\[PHOTO:[^\]]+\]\]/g, "").trim();

    await db.insert(messagesTable).values({ conversationId, role: "assistant", content: cleaned });
    if (cleaned) await this.sendMessage(userId, cleaned, this.buildMainMenuKeyboard());
  }

  private async checkEncyclopediaLimit(userId: number, user?: MaxUser): Promise<boolean> {
    const DAILY_LIMIT = 10;
    const today = new Date().toISOString().slice(0, 10);
    const key = `enc_daily:${userId}:${today}`;
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    const count = parseInt(rows[0]?.value ?? "0", 10);
    if (count >= DAILY_LIMIT) return false;
    await db
      .insert(settingsTable)
      .values({ key, value: String(count + 1) })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(count + 1), updatedAt: new Date() } });
    // Store/update user info for stats
    if (user) {
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || String(userId);
      const info = JSON.stringify({ name, username: user.username ?? undefined });
      const infoKey = `enc_user:${userId}`;
      await db
        .insert(settingsTable)
        .values({ key: infoKey, value: info })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: info, updatedAt: new Date() } });
    }
    return true;
  }

  private async handleEncyclopediaChat(userId: number, text: string, user?: MaxUser): Promise<void> {
    const allowed = await this.checkEncyclopediaLimit(userId, user);
    if (!allowed) {
      await this.sendMessage(
        userId,
        "⚠️ Ваш лимит на сегодня исчерпан. Возвращайтесь завтра!",
        this.buildMainMenuKeyboard(),
      );
      this.encyclopediaSessions.delete(userId);
      return;
    }

    const kb = loadKnowledgeBase();
    const systemContent = ENCYCLOPEDIA_PROMPT + (kb ? `\n\n${kb}` : "");

    let reply: string;
    try {
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        max_completion_tokens: 1200,
        temperature: 0.75,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: text },
        ],
      });
      reply = completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      logger.error({ err }, "OpenAI encyclopedia completion failed for MAX");
      await this.sendMessage(userId, "Извините, произошла ошибка. Попробуйте ещё раз чуть позже.", this.buildMainMenuKeyboard());
      return;
    }

    if (reply) await this.sendMessage(userId, reply, this.buildEncyclopediaKeyboard());
  }

  // ── Update handlers ────────────────────────────────────────────────────────

  private async handleBotStarted(update: MaxUpdate): Promise<void> {
    const user = update.user;
    if (!user) return;
    const userId = user.user_id;

    const isAdmin = user.username?.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (isAdmin) await setAdminChatId(userId);

    await this.getOrCreateConversation(userId, user);
    if (isAdmin) {
      await this.sendMessage(userId, "✅ Вы подключены как администратор. Сюда будут приходить заявки.", this.buildMainMenuKeyboard());
    } else {
      await this.sendWelcome(userId);
    }
  }

  private async handleMessageCreated(update: MaxUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.sender) return;
    const user = msg.sender;
    const userId = user.user_id;
    const text = msg.body?.text?.trim();
    if (!text) return;

    const isAdmin = user.username?.toLowerCase() === ADMIN_USERNAME.toLowerCase();
    if (isAdmin) await setAdminChatId(userId);

    // Owner registration: Irina sends the secret phrase to link her account
    if (text.toLowerCase() === "завязь владелец") {
      await setMaxOwnerUserId(userId);
      await this.sendMessage(userId, "✅ Ваш аккаунт зарегистрирован как получатель заявок. Все новые заявки будут приходить сюда.");
      return;
    }

    const conversationId = await this.getOrCreateConversation(userId, user);

    // Encyclopedia mode — route to encyclopedia AI
    if (this.encyclopediaSessions.has(userId)) {
      await this.handleEncyclopediaChat(userId, text, user);
      return;
    }

    // Regular AI chat
    await this.handleAiChat(userId, conversationId, text, user);
  }

  private async handleMessageCallback(update: MaxUpdate): Promise<void> {
    const cb = update.callback;
    if (!cb) return;
    const user = cb.user;
    const userId = user.user_id;
    const payload = (cb as any).payload ?? (cb as any).data ?? "";
    logger.info({ payload, raw: JSON.stringify(cb).slice(0, 200) }, "MAX callback");

    const conversationId = await this.getOrCreateConversation(userId, user);

    // Main menu actions
    if (payload === "menu:main") {
      this.encyclopediaSessions.delete(userId);
      await this.sendLogoThenMenu(userId, "Главное меню:");
      return;
    }
    if (payload === "menu:news") {
      this.encyclopediaSessions.delete(userId);
      await this.sendNewsDigest(userId);
      return;
    }
    if (payload === "menu:encyclopedia") {
      const reEnter = this.encyclopediaSessions.has(userId);
      await this.sendEncyclopediaIntro(userId, reEnter);
      return;
    }
    if (payload === "menu:contact") {
      this.encyclopediaSessions.delete(userId);
      await this.sendMessage(
        userId,
        `${DESIGNER_NAME} — дизайнер ателье «Завязь»\n\n📞 ${OWNER_PHONE_DISPLAY}`,
        this.buildMainMenuKeyboard(),
      );
      return;
    }
    if (payload === "menu:order") {
      this.encyclopediaSessions.delete(userId);
      await this.sendMessage(userId, "Выберите изделие для заказа 👇", this.buildCategoryKeyboard());
      return;
    }

    // Category selection
    if (payload.startsWith("cat:")) {
      const cat = payload.slice("cat:".length);
      console.log(`[MAX callback] Category selected: "${cat}"`);
      if (!ORDER_CATEGORIES.includes(cat)) {
        console.log(`[MAX callback] Category "${cat}" not in ORDER_CATEGORIES`);
        return;
      }

      const photos = getProductImageFiles(cat);
      console.log(`[MAX callback] Photos to send:`, photos);
      if (photos.length > 0) {
        await this.sendPhotos(userId, photos, 3);
      }

      const priceText = getPriceDisplay(cat) ?? cat;

      await this.sendMessage(
        userId,
        `${priceText}\n\nДоступны различные цвета и размеры, согласовываются индивидуально.\n\nЧтобы оформить заказ, позвоните дизайнеру ателье ${DESIGNER_NAME}:\n📞 ${OWNER_PHONE_DISPLAY}`,
        this.buildAfterProductKeyboard(),
      );
      return;
    }

    // Like button
    if (payload === "action:like") {
      await db.execute(sql`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('likes_total', '1', NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = (CAST(settings.value AS BIGINT) + 1)::text,
          updated_at = NOW()
      `);
      const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, "likes_total"));
      const count = parseInt(rows[0]?.value ?? "1", 10);
      await this.sendMessage(userId, `🔥 Спасибо! Уже ${count} ${pluralFires(count)}!`, this.buildMainMenuKeyboard());
      return;
    }

    // Unknown callback — ignore, no error
    logger.info({ payload, userId }, "MAX: unknown callback payload");
    void conversationId;
  }

  // ── Long polling ────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    while (this.running) {
      const params: Record<string, string | number> = { timeout: 30, limit: 100 };
      if (this.marker !== null) params.marker = this.marker;

      const data = await this.get<MaxUpdatesResponse>("/updates", params);
      if (!data) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      if (typeof data.marker === "number") this.marker = data.marker;

      for (const update of data.updates ?? []) {
        try {
          if (update.update_type === "bot_started") {
            await this.handleBotStarted(update);
          } else if (update.update_type === "message_created") {
            await this.handleMessageCreated(update);
          } else if (update.update_type === "message_callback") {
            await this.handleMessageCallback(update);
          }
        } catch (err) {
          logger.error({ err, update_type: update.update_type }, "MAX: failed to handle update");
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    const me = await this.get<{ user_id: number; name?: string; username?: string }>("/me");
    if (!me) {
      logger.error("MAX bot token invalid or API unreachable — MAX bot not started");
      return;
    }
    this.running = true;
    logger.info({ username: me.username, name: me.name }, "MAX bot started (long polling)");
    void this.poll();
  }
}

export function startMaxBot(): void {
  const token = process.env.MAX_BOT_TOKEN?.trim();
  if (!token) {
    logger.info("MAX_BOT_TOKEN not set — MAX bot disabled");
    return;
  }
  const bot = new MaxBot(token);
  void bot.start();
}
