import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

// Trim whitespace only — provider uses /v1 in path
const baseURL = process.env.OPENAI_BASE_URL?.trim();
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(baseURL ? { baseURL } : {}),
});

export const CHAT_MODEL = "openai/gpt-4o-mini";

// Product catalog from knowledge base — URL paths served as static assets by the web app
export const PRODUCT_CATALOG: Record<string, string[]> = {
  палантин: ["/products/image1.png", "/products/image2.png", "/products/image3.png"],
  шарф:     ["/products/image4.png", "/products/image5.png"],
  шапка:    ["/products/image4.png", "/products/image5.png"],
  снуд:     ["/products/image4.png", "/products/image5.png"],
  косынка:  ["/products/image4.png", "/products/image5.png"],
  плед:     ["/products/image6.jpg", "/products/image7.jpg", "/products/image8.jpg"],
  платье:   ["/products/image9.jpg", "/products/image10.jpg"],
  джемпер:  ["/products/image9.jpg", "/products/image10.jpg"],
  кардиган: ["/products/image9.jpg", "/products/image10.jpg"],
  туника:   ["/products/image9.jpg", "/products/image10.jpg"],
  одежда:   ["/products/image9.jpg", "/products/image10.jpg"],
  брюки:    ["/products/image10.jpg"],
  штаны:    ["/products/image10.jpg"],
  кофта:    ["/products/image10.jpg"],
  кофты:    ["/products/image10.jpg"],
  другое:   ["/products/image10.jpg"],
  подарок:  ["/products/image1.png", "/products/image4.png", "/products/image6.jpg", "/products/image9.jpg"],
};

export function getImagesForKeyword(keyword: string): string[] {
  const k = keyword.toLowerCase().trim();
  for (const [cat, imgs] of Object.entries(PRODUCT_CATALOG)) {
    if (k.includes(cat) || cat.includes(k)) return imgs;
  }
  return [];
}

// Maps an AI marker category to a product folder under products/
export const CATEGORY_FOLDERS: Record<string, string> = {
  палантин: "Палантин",
  палантины: "Палантин",
  шарф: "Шарфы и шапки",
  шарфы: "Шарфы и шапки",
  шапки: "Шарфы и шапки",
  шапка: "Шарфы и шапки",
  снуд: "Снуд",
  снуды: "Снуд",
  косынка: "Косынка",
  косынки: "Косынка",
  плед: "Пледы",
  пледы: "Пледы",
  платье: "Платья",
  платья: "Платья",
  джемпер: "Джемпер",
  джемперы: "Джемпер",
  кардиган: "Кардиганы",
  кардиганы: "Кардиганы",
  туника: "Туники",
  туники: "Туники",
  свитер: "Свитер",
  свитеры: "Свитер",
  брюки: "Брюки, кофты и другая одежда",
  штаны: "Брюки, кофты и другая одежда",
  кофта: "Брюки, кофты и другая одежда",
  кофты: "Брюки, кофты и другая одежда",
  одежда: "Брюки, кофты и другая одежда",
  другое: "Брюки, кофты и другая одежда",
};

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Locate the products/ knowledge-base directory regardless of process cwd.
function resolveProductsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "products"),
    path.resolve(process.cwd(), "../../products"),
    path.resolve(process.cwd(), "../../../products"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export const PRODUCTS_DIR = resolveProductsDir();

function folderForCategory(category: string): string | null {
  const k = category.toLowerCase().trim();
  if (CATEGORY_FOLDERS[k]) return CATEGORY_FOLDERS[k];
  for (const [cat, folder] of Object.entries(CATEGORY_FOLDERS)) {
    if (k.includes(cat) || cat.includes(k)) return folder;
  }
  return null;
}

function readFolderImages(folder: string): string[] {
  const dir = path.join(PRODUCTS_DIR, folder, "Фотоизображения");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => path.join(dir, f));
}

// For a "gift" suggestion we show one photo from a few representative categories.
const GIFT_FOLDERS = ["Палантин", "Шарфы и шапки", "Пледы", "Платья"];

// Scans arbitrary text for known product keywords and returns image files for the
// first matching category. Used as a fallback when the AI omits [ПОКАЗАТЬ:…] markers.
export function getImageFilesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  for (const keyword of Object.keys(CATEGORY_FOLDERS)) {
    if (lower.includes(keyword)) {
      const files = getProductImageFiles(keyword);
      if (files.length > 0) return files;
    }
  }
  return [];
}

// Returns absolute file paths of product photos for a category, read from the
// products/<Категория>/Фотоизображения/ folder (the shared knowledge base).
export function getProductImageFiles(category: string): string[] {
  const k = category.toLowerCase().trim();
  if (k.includes("подарок")) {
    const picks: string[] = [];
    for (const folder of GIFT_FOLDERS) {
      const imgs = readFolderImages(folder);
      if (imgs.length > 0) picks.push(imgs[0]);
    }
    return picks;
  }
  const folder = folderForCategory(k);
  if (!folder) return [];
  return readFolderImages(folder);
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
