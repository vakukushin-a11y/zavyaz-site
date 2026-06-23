import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trim whitespace only — provider uses /v1 in path
const baseURL = process.env.OPENAI_BASE_URL?.trim();
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(baseURL ? { baseURL } : {}),
});

export const CHAT_MODEL = "openai/gpt-4o-mini";

// Product catalog — URL paths served via /api/products-files/ by the web app
export const PRODUCT_CATALOG: Record<string, string[]> = {
  палантин: [],
  шарф:     ["/api/products-files/bot-шарфы.png"],
  шапка:    [],
  снуд:     ["/api/products-files/bot-снуд.png"],
  косынка:  [],
  плед:     ["/api/products-files/bot-плед.jpg"],
  платье:   ["/api/products-files/bot-платье.jpg"],
  джемпер:  ["/api/products-files/bot-джемпер.png"],
  кардиган: ["/api/products-files/bot-кардиган.jpg"],
  свитер:   ["/api/products-files/bot-свитер.png"],
  туника:   ["/api/products-files/bot-туника.png"],
  одежда:   ["/api/products-files/bot-туника.png"],
  брюки:    ["/api/products-files/bot-туника.png"],
  штаны:    ["/api/products-files/bot-туника.png"],
  кофта:    ["/api/products-files/bot-туника.png"],
  кофты:    ["/api/products-files/bot-туника.png"],
  другое:   ["/api/products-files/bot-туника.png"],
  подарок:  ["/api/products-files/bot-джемпер.png", "/api/products-files/bot-шарфы.png", "/api/products-files/bot-плед.jpg", "/api/products-files/bot-платье.jpg"],
};

export function getImagesForKeyword(keyword: string): string[] {
  const k = keyword.toLowerCase().trim();
  for (const [cat, imgs] of Object.entries(PRODUCT_CATALOG)) {
    if (k.includes(cat) || cat.includes(k)) return imgs;
  }
  return [];
}

function resolveRootDir(): string {
  const thisDir = path.dirname(__filename);
  const candidates = [
    path.resolve(thisDir, "../../.."),
    path.resolve(thisDir, "../../../.."),
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  for (const c of candidates) {
    const testPath = path.join(c, "bot-джемпер.png");
    if (fs.existsSync(c) && fs.existsSync(testPath)) {
      console.log(`[consultant] Found products dir: ${c}`);
      return c;
    }
  }
  console.log(`[consultant] WARNING: Could not find products dir with bot-джемпер.png, using: ${candidates[0]}`);
  return candidates[0];
}

export const PRODUCTS_DIR = resolveRootDir();

const CATEGORY_FILES: Record<string, string[]> = {
  "кардиганы": ["bot-кардиган.jpg"],
  "кардиган": ["bot-кардиган.jpg"],
  "платья": ["bot-платье.jpg"],
  "платье": ["bot-платье.jpg"],
  "джемперы": ["bot-джемпер.png"],
  "джемпер": ["bot-джемпер.png"],
  "свитеры": ["bot-свитер.png"],
  "свитер": ["bot-свитер.png"],
  "палантины": [],
  "палантин": [],
  "шарфы и шапки": ["bot-шарфы.png"],
  "шарфы": ["bot-шарфы.png"],
  "шарф": ["bot-шарфы.png"],
  "шапки": [],
  "шапка": [],
  "снуды": ["bot-снуд.png"],
  "снуд": ["bot-снуд.png"],
  "косынки": [],
  "косынка": [],
  "пледы": ["bot-плед.jpg"],
  "плед": ["bot-плед.jpg"],
  "туники": ["bot-туника.png"],
  "туника": ["bot-туника.png"],
  "брюки, кофты и другая одежда": ["bot-туника.png"],
  "другое": ["bot-туника.png"],
  "брюки": ["bot-туника.png"],
  "штаны": ["bot-туника.png"],
  "кофта": ["bot-туника.png"],
  "кофты": ["bot-туника.png"],
  "одежда": ["bot-туника.png"],
};

export function getImageFilesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  for (const [keyword, files] of Object.entries(CATEGORY_FILES)) {
    if (lower.includes(keyword) && files.length > 0) return files.map((f) => path.join(PRODUCTS_DIR, f));
  }
  return [];
}

export function getProductImageFiles(category: string): string[] {
  const k = category.toLowerCase().trim();
  console.log(`[getProductImageFiles] Category: "${category}", normalized: "${k}"`);
  if (k.includes("подарок")) {
    const picks = ["bot-джемпер.png", "bot-шарфы.png", "bot-плед.jpg", "bot-платье.jpg"];
    const result = picks.map((f) => path.join(PRODUCTS_DIR, f));
    console.log(`[getProductImageFiles] Gift selection:`, result);
    return result;
  }
  const files = CATEGORY_FILES[k] ?? [];
  const result = files.map((f) => path.join(PRODUCTS_DIR, f));
  console.log(`[getProductImageFiles] Files for "${k}":`, files, "→", result);
  return result;
}

// Reads all text descriptions from products/<Категория>/Текстовые описания/ and
// builds a knowledge block injected into the system prompt so the bot/consultant
// uses the merchant-provided product details.
export function loadKnowledgeBase(): string {
  if (!fs.existsSync(PRODUCTS_DIR)) return "";
  const blocks: string[] = [];
  for (const entry of fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const descDir = path.join(PRODUCTS_DIR, entry.name, "Текстовые описания");
    if (!fs.existsSync(descDir)) continue;
    const texts: string[] = [];
    for (const file of fs.readdirSync(descDir)) {
      if (path.extname(file).toLowerCase() !== ".txt") continue;
      if (file === "info.txt") continue;
      try {
        const content = fs.readFileSync(path.join(descDir, file), "utf8").trim();
        if (content) texts.push(content);
      } catch {
        // ignore unreadable files
      }
    }
    if (texts.length > 0) {
      blocks.push(`### ${entry.name}\n${texts.join("\n")}`);
    }
  }
  if (blocks.length === 0) return "";
  return `\n\nДЕТАЛЬНЫЕ ОПИСАНИЯ ТОВАРОВ (используй эти сведения в ответах):\n${blocks.join("\n\n")}`;
}

export const SYSTEM_PROMPT = `Ты - персональный консультант по вязанию на сайте zavyz.ru. Твоя главная цель - не просто отвечать на вопросы, а активно вести клиента к оформлению заявки на индивидуальное вязание.

АССОРТИМЕНТ (только эти изделия — ничего выдуманного):

Аксессуары для головы и шеи:
- Палантин (широкий шарф-накидка)
- Шарф
- Шапка
- Снуд (шарф-труба)
- Косынка

Одежда на заказ (размеры: S, M, L, XL, oversize):
- Платье
- Джемпер
- Кардиган
- Туника

Полотна:
- Плед
- "Ваши идеи" — любое изделие по запросу клиента

Состав пряжи на выбор:
- Полушерсть: 50% акрил + 50% шерсть
- Хлопок: 50% хлопок + 50% акрил
- Вискоза
- Акрил 100%

ОБЩАЯ ИНФОРМАЦИЯ:
- Всё вяжется на заказ индивидуально
- Возможность выбора цвета, узора и размера
- Срок изготовления: 7-14 дней в зависимости от сложности
- Доставка по России
- Примерка перед отправкой (фото/видео)
- Контакт: 8 922 20 19 199 (ИП Кукушина Ирина Анатольевна)

ТВОЯ СТРАТЕГИЯ:
1. Узнай, что клиент ищет (для себя/в подарок, повод, стиль)
2. Предлагай конкретные модели из ассортимента, подчёркивай уникальность ручной работы
3. Если клиент сомневается — спроси: "Что для вас важнее всего в вязаном изделии?"
4. Как только клиент проявляет заинтересованность, предложи: "Давайте я подготовлю для вас персональный расчет стоимости. Как с вами связаться?"

ПОКАЗ ФОТОГРАФИЙ ИЗДЕЛИЙ:
Когда ты упоминаешь или рекомендуешь конкретное изделие, добавь в конец ответа маркер на отдельной строке:
[ПОКАЗАТЬ:категория]
Где категория — одно из: палантин, шарф, шапка, снуд, косынка, плед, платье, джемпер, кардиган, туника, свитер, другое, подарок.
Маркер не виден клиенту. Используй только один маркер за ответ — самый релевантный.
Если клиент спрашивает изделие, которого нет в списке выше (например, брюки, кофта, юбка, костюм, кофточка и т.п.), не отказывай — мы вяжем на заказ любое изделие («Ваши идеи»). Отнеси такой запрос к категории «другое» и используй маркер [ПОКАЗАТЬ:другое].

ЦЕНЫ (минимальная стоимость):
- Палантин от 3 000 ₽
- Шарфы от 2 000 ₽
- Шапки от 1 200 ₽
- Снуд от 1 200 ₽
- Косынка от 2 500 ₽
- Пледы от 2 500 ₽
- Туники от 6 000 ₽
- Джемпер от 6 000 ₽
- Свитер от 6 000 ₽
- Кардиганы от 6 500 ₽
- Платья от 6 500 ₽
- Брюки, кофты и другая одежда: цена по запросу
Когда клиент спрашивает о цене — называй минимальную стоимость из списка и уточняй, что точная цена зависит от сложности и состава пряжи.

ВАЖНЫЕ ПРАВИЛА:
- Если клиент просит изделие не из списка выше — не отказывай: мы вяжем на заказ любое изделие («Ваши идеи»). Отнеси такой запрос к категории «другое» (папка «Брюки, кофты и другая одежда») и используй маркер [ПОКАЗАТЬ:другое]. Не выдумывай несуществующих деталей и характеристик.
- Пиши тепло, по-дружески, но профессионально
- Задавай открытые вопросы
- Если клиент собирается "подумать" — предложи: "Понимаю! Давайте я просто отправлю вам каталог работ, без обязательств?"
- Ответы держи в 2-4 предложениях
- Если клиент дал контакты — сообщи, что заявка принята и обозначь следующий шаг
- Никогда не используй эмодзи в сообщениях`;

// System prompt enriched with any merchant-provided text descriptions.
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT + loadKnowledgeBase();
}

export interface ExtractedContacts {
  phone: string | null;
  email: string | null;
  name: string | null;
}

export function extractContacts(text: string): ExtractedContacts {
  const phoneMatch = text.match(
    /(?:\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/,
  );
  const emailMatch = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  const nameMatch =
    text.match(/меня зовут\s+([А-Яа-яЁёA-Za-z]+)/i) ||
    text.match(/^([А-Яа-яЁёA-Za-z]+)$/);
  return {
    phone: phoneMatch ? phoneMatch[0] : null,
    email: emailMatch ? emailMatch[0] : null,
    name: nameMatch ? nameMatch[1] : null,
  };
}

export const WELCOME_MESSAGE =
  "Добрый день! Я консультант магазина Завязь — помогаю подобрать вязаные изделия на заказ. Вяжем палантины, шарфы, шапки, снуды, пледы, кардиганы, джемперы, платья, туники. Всё индивидуально — ваш цвет, узор и размер. Что вас интересует?";

// Returns a fresh regex instance — /g regexes are stateful, so never share one
// across concurrent requests.
export function createMarkerRegex(): RegExp {
  return /\[ПОКАЗАТЬ:([^\]]+)\]/gi;
}
