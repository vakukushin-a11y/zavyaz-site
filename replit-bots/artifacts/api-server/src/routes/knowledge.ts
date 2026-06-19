import { Router } from "express";
import { openai, CHAT_MODEL, loadKnowledgeBase } from "../ai/consultant";

const router = Router();

const ENCYCLOPEDIA_PROMPT = `Ты — «Энциклопедия трикотажа», дружелюбный AI-эксперт по трикотажу.

Твоя задача — помогать посетителям:
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

// ── Rate limiter ──────────────────────────────────────────────────────────────
const DAILY_LIMIT = 10;

interface RateEntry {
  count: number;
  date: string; // YYYY-MM-DD
}

const rateLimiter = new Map<string, RateEntry>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const today = todayStr();
  const entry = rateLimiter.get(ip);

  if (!entry || entry.date !== today) {
    rateLimiter.set(ip, { count: 1, date: today });
    return { allowed: true, remaining: DAILY_LIMIT - 1 };
  }

  if (entry.count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.post("/knowledge/chat", async (req, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }

  const ip = getIp(req);
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    res.status(429).json({
      error: "limit_exceeded",
      message: "Дневной лимит 10 запросов исчерпан. Возвращайтесь завтра! 🌙",
      remaining: 0,
    });
    return;
  }

  const kb = loadKnowledgeBase();
  const systemContent = ENCYCLOPEDIA_PROMPT + (kb ? `\n\n${kb}` : "");

  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemContent },
        ...history.slice(-10),
        { role: "user", content: message },
      ],
      max_tokens: 900,
      temperature: 0.75,
    });
    const reply = completion.choices[0]?.message?.content ?? "";
    res.json({ reply, remaining });
  } catch (err) {
    req.log.error({ err }, "Knowledge chat error");
    res.status(500).json({ error: "Ошибка AI" });
  }
});

export default router;
