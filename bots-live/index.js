const express = require("express");
const OpenAI = require("openai");
const app = express();
const session = require("express-session");
const playwrightScraper = require("./playwright-scraper");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: "zavyz-cms-2026", resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));
app.use("/img", express.static(__dirname + "/img"));
app.use("/admin", express.static(__dirname + "/admin"));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.OPENAI_BASE_URL || "https://routerai.ru/api/v1";
const API_KEY = process.env.OPENAI_API_KEY || "";
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const MAX_TOKEN = process.env.MAX_BOT_TOKEN || "";
const HOST = process.env.HOST || `http://localhost:${PORT}`;
const fs = require("fs");

const openai = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });
const DESIGNER = "Ирина Кукушина";
const PHONE = "+7 922 20 19 19 9";

const RSS_SOURCES = [];

// Yandex search scraping — primary source for Russian knitwear news
const YANDEX_QUERIES = [
  "трикотаж новости Россия",
  "свитер кардиган тренды 2026",
  "вязание на заказ мода",
  "трикотажная мода Россия дизайнеры",
  "пряжа свитер джемпер новости",
  "кашемир меринос шерсть мода",
  "российские дизайнеры трикотаж",
  "вязаная мода подиум",
  "трикотажные фабрики Россия",
  "мода осень зима свитер кардиган",
];

async function scrapeYandex(query) {
  // Парсинг отключён
  return [];
}

// Web scraping — specific Russian sites
const SCRAPE_SOURCES = [
  // Российские модные и новостные сайты
  { name: "Мода 24/7", urls: [
    "https://moda247.ru/news/",
    "https://moda247.ru/news/page/2/",
    "https://moda247.ru/news/page/3/",
    "https://moda247.ru/news/page/4/",
    "https://moda247.ru/news/page/5/"
  ] },
  { name: "Moda.ru", urls: [
    "https://moda.ru/news/",
    "https://moda.ru/news/page/2/",
    "https://moda.ru/news/page/3/",
    "https://moda.ru/news/page/4/",
    "https://moda.ru/news/page/5/"
  ] },
  { name: "ProFashion", urls: [
    "https://profashion.ru/news/",
    "https://profashion.ru/news/page/2/",
    "https://profashion.ru/news/page/3/",
    "https://profashion.ru/news/page/4/",
    "https://profashion.ru/news/page/5/"
  ] },
  { name: "InterModa", urls: [
    "https://www.intermoda.ru/",
    "https://www.intermoda.ru/page/2/",
    "https://www.intermoda.ru/page/3/",
    "https://www.intermoda.ru/page/4/",
    "https://www.intermoda.ru/page/5/"
  ] },
  { name: "Forbes", urls: [
    "https://www.forbes.ru/",
    "https://www.forbes.ru/page/2/",
    "https://www.forbes.ru/page/3/",
    "https://www.forbes.ru/2025/",
    "https://www.forbes.ru/2026/"
  ] },
  { name: "РИА Новости", urls: [
    "https://ria.ru/",
    "https://ria.ru/page/2/",
    "https://ria.ru/page/3/",
    "https://ria.ru/20250101/",
    "https://ria.ru/20250601/",
    "https://ria.ru/20260101/"
  ] },
  { name: "Российская газета", urls: [
    "https://rg.ru/tag/trikotazh",
    "https://rg.ru/tag/trikotazh/page/2",
    "https://rg.ru/tag/trikotazh/page/3",
    "https://rg.ru/tag/trikotazh/page/4",
    "https://rg.ru/tag/trikotazh/page/5"
  ] },
  // Иностранные модные сайты (работают в РФ)
  { name: "WWD", urls: [
    "https://wwd.com/",
    "https://wwd.com/page/2/",
    "https://wwd.com/page/3/"
  ], usePlaywright: true },
  { name: "Harper's Bazaar US", urls: [
    "https://www.harpersbazaar.com/",
    "https://www.harpersbazaar.com/page/2/",
    "https://www.harpersbazaar.com/page/3/"
  ], usePlaywright: true },
  { name: "Elle US", urls: [
    "https://www.elle.com/",
    "https://www.elle.com/page/2/",
    "https://www.elle.com/page/3/"
  ], usePlaywright: true },
];

const KNITWEAR_KEYWORDS = [
  "трикотаж", "вязан", "пряжа", "свитер", "кардиган", "джемпер", "пуловер",
  "шерсть", "вязк", "спицы", "меринос", "кашемир", "хлопок", "акрил", "вискоза",
  "палантин", "снуд", "плед", "туника", "шарф", "шапк",
  "knit", "knitwear", "yarn", "wool", "sweater", "cardigan", "cashmere", "crochet",
];

const EXCLUDE_KEYWORDS = [
  "персональн", "конфиденциальн", "договор", "юридическ", "правов", "соглашени",
  "политик", "услови", "обработк", "данн", "cookie", "прав", "лицензи",
  "ответственн", "гарант", "возврат", "оплат", "доставк", "пользовател",
  "регистраци", "авторизац", "аккаунт", "профил", "настройк",
  "подписк", "рассылк", "новостн", "реклам", "маркетинг",
  "terms of service", "privacy policy", "user agreement", "cookie policy",
  "GDPR", "CCPA", "data protection", "personal data",
  "швейн", "шитье", "шить", "пошив", "швея", "швейная машина",
  "рукоделие", "ручное вязание", "вязание на спицах"
];

// Must match at least 2 knitwear-specific keywords
function isKnitwearArticle(title, text) {
  const combined = (title + " " + text).toLowerCase();
  const matches = KNITWEAR_KEYWORDS.filter(kw => combined.includes(kw));
  return matches.length >= 2;
}

function isExcludedContent(title, text) {
  const combined = (title + " " + text).toLowerCase();
  const matches = EXCLUDE_KEYWORDS.filter(kw => combined.includes(kw));
  return matches.length >= 2;
}

async function translateToRussian(title, text) {
  try {
    const resp = await openai.chat.completions.create({
      model: "deepseek/deepseek-chat",
      messages: [
        { role: "system", content: "Ты — профессиональный переводчик с английского на русский. Переводи точно, сохраняя смысл и стиль. Переводи только текст, без комментариев." },
        { role: "user", content: `Переведи на русский язык:\n\nЗаголовок: ${title}\n\nТекст: ${text}` }
      ],
      max_tokens: 2000
    });
    const result = resp.choices[0]?.message?.content || "";
    const lines = result.split("\n").filter(l => l.trim());
    const translatedTitle = lines[0]?.replace(/^Заголовок:\s*/i, "") || title;
    const translatedText = lines.slice(1).join("\n").replace(/^Текст:\s*/i, "").trim() || text;
    return { title: translatedTitle, text: translatedText };
  } catch(e) {
    console.log("[Translate] Ошибка:", e.message);
    return { title, text };
  }
}

async function scrapeArticlePage(url, usePlaywright = false) {
  // Парсинг отключён
  return null;
}

async function scrapeSite(source) {
  // Парсинг отключён
  return [];
}

async function fetchLiveNews() {
  // Парсинг отключён
  return [];
}

// ── Encyclopedia ──────────────────────────────────────────────────────────
const ENCYCLOPEDIA = {
  "джемпер": "Джемпер — верхнее трикотажное изделие с длинными рукавами без застёжки. Тоньше свитера, без высокого воротника. Материалы: шерсть, меринос, хлопок, акрил. Появился у английских рыбаков XIX века. Для офиса и casual.",
  "свитер": "Свитер — тёплое вязаное изделие с длинными рукавами и высоким воротником. Теплее джемпера. Aran sweater из Ирландии — мировая икона. Материалы: шерсть, меринос, кашемир.",
  "кардиган": "Кардиган — вязаная кофта с застёжкой спереди. Назван в честь лорда Кардигана (Крымская война, 1850-е). Материалы: шерсть, хлопок, акрил, вискоза. Носят круглый год.",
  "кашемир": "Кашемир — пух горной козы, ценнейшая пряжа. С одной козы — 150–200 г в год. Мягкий, тёплый, лёгкий. Уход: ручная стирка 30°C, сушить горизонтально.",
  "меринос": "Меринос — шерсть овцы-мериноса. Тонкое, мягкое волокно, не колется. Одна овца даёт до 10 кг в год. Дышит, согревает во влажном состоянии.",
  "шерсть": "Шерсть — натуральное волокно. Отлично согревает, дышит, отводит влагу. Разлагается в почве за ~5 лет. Требует деликатной стирки при 30°C.",
  "акрил": "Акрил — синтетическое волокно. Лёгкий, не колется, держит форму. В ателье ЗАВЯЗЬ: смесь 50% акрил + 50% шерсть — оптимальный баланс.",
  "вискоза": "Вискоза — искусственное волокно из целлюлозы. Мягкая, блестящая, «летний» материал. Хорошо дышит. Требует деликатного ухода.",
  "хлопок": "Хлопок — натуральное растительное волокно. Гипоаллергенный, дышит. Для чувствительной кожи и лета. В ателье: 50% хлопок + 50% акрил.",
  "стирк": "Стирайте ВРУЧНУЮ при 30°C. Средства для шерсти. Не выкручивайте — отожмите через полотенце. Сушите ГОРИЗОНТАЛЬНО. Храните сложенными!",
  "уход": "Трикотаж: ручная стирка 30°C, сушка горизонтально, хранение сложенным. Кашемир/шерсть — только руками. Акрил/хлопок — деликатный режим.",
  "плать": "Трикотажное платье — цельное изделие от плеч до бёдер. Тянется лучше тканого. Материалы: вискоза, хлопок, шерсть. В моду вошло в 1920-х.",
  "туник": "Туника — длинный вязаный топ, покрывающий бёдра. С леггинсами или как платье. Хлопок, вискоза. Древнейший предмет одежды — ещё в Риме.",
  "палантин": "Палантин — широкий шарф-накидка (~50×200 см). На плечах, шее или как шаль. Шерсть, кашемир. Из Персии, в Европе с XVIII века.",
  "снуд": "Снуд — шарф-труба без концов. Не развязывается, не путается. Шерсть, акрил, мохер. Появился в 1970-х.",
  "плед": "Плед — вязаное полотно для уюта. Украшает интерьер, согревает. Шерсть, акрил, мохер. Из Шотландии (plaid — одеяло), в интерьерах с XIX века.",
};

app.use("/img", express.static(__dirname + "/img"));

// ── Products & Prices ────────────────────────────────────────────────────
const PRODUCTS = [
  { name: "Кардиганы", price: "от 6 500 ₽", img: "bot-кардиган.png" },
  { name: "Платья", price: "от 6 500 ₽", img: "bot-платье.jpg" },
  { name: "Джемперы", price: "от 6 000 ₽", img: "bot-джемпер.png" },
  { name: "Свитеры", price: "от 6 000 ₽", img: "bot-свитер.png" },
  { name: "Снуды", price: "от 1 200 ₽", img: "bot-снуд.png" },
  { name: "Шарфы и шапки", price: "от 1 200 ₽", img: "bot-шарфы.png" },
  { name: "Пледы", price: "от 2 500 ₽", img: "kb-img-14.png" },
  { name: "Палантины", price: "от 3 000 ₽", img: "kb-img-12.jpg" },
  { name: "Туники", price: "от 6 000 ₽", img: "kb-img-10.png" },
  { name: "Косынки", price: "от 2 500 ₽", img: "kb-img-15.png" },
];

app.get("/api/products", (_, res) => res.json(PRODUCTS));

// ── Health & API routes ───────────────────────────────────────────────────
app.get("/", (_, res) => res.send("ZAVYAZ Bots OK"));
app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.get("/api/news", async (_, res) => { 
  const cms = readNews(); 
  res.json(sortNewsByDate(cms)); 
});

const ROTATION_FILE = __dirname + "/rotation.json";
function readRotation() { try { return JSON.parse(fs.readFileSync(ROTATION_FILE, "utf8")); } catch { return {}; } }
function writeRotation(data) { fs.writeFileSync(ROTATION_FILE, JSON.stringify(data, null, 2)); }
if (!fs.existsSync(ROTATION_FILE)) writeRotation({});

function getNextUrl(source) {
  const rotation = readRotation();
  const key = source.name;
  if (!rotation[key]) rotation[key] = 0;
  const urls = source.urls || [source.url];
  const currentIndex = rotation[key];
  const url = urls[currentIndex % urls.length];
  rotation[key] = (currentIndex + 1) % urls.length;
  writeRotation(rotation);
  return url;
}

// ── CMS ───────────────────────────────────────────────────────────────────
const CMS_PASSWORD = "zavyz2026";
const NEWS_FILE = __dirname + "/news.json";
const SUBSCRIBERS_FILE = __dirname + "/subscribers.json";

function readNews() { try { return JSON.parse(fs.readFileSync(NEWS_FILE, "utf8")); } catch { return []; } }
function writeNews(data) { fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2)); }
if (!fs.existsSync(NEWS_FILE)) writeNews([]);

function sortNewsByDate(news) {
  return news.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt) : (a.date ? parseDate(a.date) : new Date(0));
    const dateB = b.createdAt ? new Date(b.createdAt) : (b.date ? parseDate(b.date) : new Date(0));
    return dateB - dateA;
  });
}

function parseDate(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(dateStr);
}

function readSubscribers() { try { return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, "utf8")); } catch { return { tg: [], max: [] }; } }
function writeSubscribers(data) { fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2)); }
if (!fs.existsSync(SUBSCRIBERS_FILE)) writeSubscribers({ tg: [], max: [] });

function addSubscriber(type, id) {
  const subs = readSubscribers();
  const key = type === "tg" ? "tg" : "max";
  if (!subs[key].includes(id)) {
    subs[key].push(id);
    writeSubscribers(subs);
    console.log(`[Subscribers] Added ${type}: ${id}, total: ${subs[key].length}`);
  }
}

app.post("/api/cms/login", (req, res) => {
  if (req.body.password === CMS_PASSWORD) { req.session.admin = true; return res.json({ ok: true }); }
  res.status(401).json({ ok: false, error: "Неверный пароль" });
});
app.get("/api/cms/check", (req, res) => { res.json({ ok: !!req.session.admin }); });
app.post("/api/cms/logout", (req, res) => { req.session.destroy(); res.json({ ok: true }); });

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Требуется вход" });
  next();
}

app.get("/api/cms/news", requireAdmin, (_, res) => { res.json(readNews()); });

app.post("/api/cms/news", requireAdmin, async (req, res) => {
  const { title, text, date, incomingId } = req.body;
  if (!title || !text) return res.status(400).json({ error: "Заголовок и текст обязательны" });
  const news = readNews();
  const article = { id: Date.now(), title, text, date: date || new Date().toLocaleDateString("ru-RU"), createdAt: new Date().toISOString() };
  news.unshift(article);
  writeNews(news);
  if (incomingId) {
    const incoming = readIncoming();
    const filtered = incoming.filter(n => n.id != incomingId);
    writeIncoming(filtered);
  }
  broadcastNewsToBots(article);
  res.json({ ok: true, article });
});

app.put("/api/cms/news/:id", requireAdmin, (req, res) => {
  const news = readNews();
  const idx = news.findIndex(n => n.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Не найдено" });
  const { title, text, date } = req.body;
  if (title) news[idx].title = title;
  if (text) news[idx].text = text;
  if (date) news[idx].date = date;
  news[idx].updatedAt = new Date().toISOString();
  writeNews(news);
  res.json({ ok: true, article: news[idx] });
});

app.delete("/api/cms/news/:id", requireAdmin, (req, res) => {
  const news = readNews();
  const filtered = news.filter(n => n.id !== parseInt(req.params.id));
  if (filtered.length === news.length) return res.status(404).json({ error: "Не найдено" });
  writeNews(filtered);
  res.json({ ok: true });
});

// Incoming news from internet — auto-fetched, ready to publish
const INCOMING_FILE = __dirname + "/incoming.json";
function readIncoming() { try { return JSON.parse(fs.readFileSync(INCOMING_FILE, "utf8")); } catch { return []; } }
function writeIncoming(data) { fs.writeFileSync(INCOMING_FILE, JSON.stringify(data, null, 2)); }
if (!fs.existsSync(INCOMING_FILE)) writeIncoming([]);

async function fetchIncomingNews() {
  // Парсинг отключён
  return [];
}



app.post("/api/cms/incoming/fetch", requireAdmin, async (_, res) => {
  res.json({ ok: false, message: "Парсинг отключён", count: 0 });
});

app.get("/api/cms/incoming", requireAdmin, (_, res) => {
  res.json(readIncoming().filter(n => n.status === "incoming"));
});

app.post("/api/cms/incoming/publish", requireAdmin, async (req, res) => {
  const { id, title, text, source } = req.body;
  const incoming = readIncoming();
  const idx = incoming.findIndex(n => n.id == id);
  if (idx === -1) return res.status(404).json({ error: "Не найдено" });
  const item = incoming[idx];
  incoming[idx].status = "published";
  writeIncoming(incoming);
  const news = readNews();
  news.unshift({ id: Date.now(), title: title || item.title, text: text || item.text, date: new Date().toLocaleDateString("ru-RU"), source: source || item.source, createdAt: new Date().toISOString() });
  writeNews(news);
  res.json({ ok: true });
});

app.delete("/api/cms/incoming/:id", requireAdmin, (req, res) => {
  const incoming = readIncoming();
  const filtered = incoming.filter(n => n.id != req.params.id);
  writeIncoming(filtered);
  res.json({ ok: true });
});

// Public news API — for site and bots
app.get("/api/public/news", (_, res) => {
  const news = readNews();
  res.json(news.slice(0, 20));
});


app.get("/api/encyclopedia", (_, res) => res.json(ENCYCLOPEDIA));

// ── Stats for Dashboard ──────────────────────────────────────────────────
app.get("/api/cms/stats", requireAdmin, (_, res) => {
  const news = readNews();
  const incoming = readIncoming();
  res.json({
    publishedCount: news.length,
    incomingCount: incoming.filter(n => n.status === "incoming").length,
    totalParsed: incoming.length,
    lastNewsDate: news.length > 0 ? news[0].createdAt : null,
    productsCount: PRODUCTS.length,
    sourcesCount: RSS_SOURCES.length + SCRAPE_SOURCES.length + YANDEX_QUERIES.length,
  });
});

// ── Products Management ──────────────────────────────────────────────────
const PRODUCTS_FILE = __dirname + "/products.json";
function readProducts() { try { return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8")); } catch { return null; } }
function writeProducts(data) { fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2)); }

app.get("/api/cms/products", requireAdmin, (_, res) => {
  const custom = readProducts();
  res.json(custom || PRODUCTS);
});

app.post("/api/cms/products", requireAdmin, (req, res) => {
  const { name, price, img } = req.body;
  if (!name || !price) return res.status(400).json({ error: "Название и цена обязательны" });
  let products = readProducts() || [...PRODUCTS];
  const product = { name, price, img: img || "bot-джемпер.png" };
  products.push(product);
  writeProducts(products);
  res.json({ ok: true, product });
});

app.put("/api/cms/products/:idx", requireAdmin, (req, res) => {
  let products = readProducts() || [...PRODUCTS];
  const idx = parseInt(req.params.idx);
  if (idx < 0 || idx >= products.length) return res.status(404).json({ error: "Не найдено" });
  const { name, price, img } = req.body;
  if (name) products[idx].name = name;
  if (price) products[idx].price = price;
  if (img) products[idx].img = img;
  writeProducts(products);
  res.json({ ok: true, product: products[idx] });
});

app.delete("/api/cms/products/:idx", requireAdmin, (req, res) => {
  let products = readProducts() || [...PRODUCTS];
  const idx = parseInt(req.params.idx);
  if (idx < 0 || idx >= products.length) return res.status(404).json({ error: "Не найдено" });
  products.splice(idx, 1);
  writeProducts(products);
  res.json({ ok: true });
});

// ── Auto-fetch incoming news — DISABLED ────────────────────────────────────
let autoFetchEnabled = false;
let autoFetchInterval = null;

app.get("/api/cms/autofetch", requireAdmin, (_, res) => {
  res.json({ enabled: false, message: "Автозагрузка отключена" });
});

app.post("/api/cms/autofetch/toggle", requireAdmin, (_, res) => {
  res.json({ enabled: false, message: "Автозагрузка отключена" });
});

// ── News formatted for bots ──────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────
async function askAI(question, isEncyclopedia = false) {
  try {
    const systemPrompt = isEncyclopedia
      ? "Ты — энциклопедия трикотажа. Отвечай на русском: пряжа, вязание, изделия, уход. Стиль: дружелюбный, экспертный, с эмодзи."
      : "Ты — консультант ателье «ЗАВЯЗЬ». Отвечай кратко, по делу. Ателье вяжет на заказ. Телефон дизайнера Ирины: +7 922 20 19 19 9. Сайт: zavyz.ru";
    const resp = await openai.chat.completions.create({
      model: "deepseek/deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: question }],
      max_tokens: isEncyclopedia ? 600 : 400,
    });
    return resp.choices[0]?.message?.content || "Не смог ответить.";
  } catch (e) { console.error("AI:", e.message); return isEncyclopedia ? findEncyclopediaAnswer(question) || "Задайте вопрос о трикотаже — джемпер, свитер, кашемир, шерсть..." : "Ошибка. Попробуйте позже."; }
}

function findEncyclopediaAnswer(q) {
  const lc = q.toLowerCase();
  for (const [key, answer] of Object.entries(ENCYCLOPEDIA)) if (lc.includes(key)) return answer;
  return null;
}

function encIntro() {
  const facts = ["🐑 Овца меринос даёт до 10 кг шерсти в год.", "📍 «Кардиган» — от лорда Кардигана, 1854 г.", "🦙 Кашемир: 150–200 г с козы в год.", "💡 Коко Шанель ввела трикотаж в моду в 1920-х."];
  const fact = facts[Math.floor(Math.random() * facts.length)];
  return `🧶 <b>Энциклопедия трикотажа</b>\n\nЯ расскажу о пряже, изделиях, уходе и истории!\n\n✨ <b>Факт:</b> ${fact}\n\n<b>Что спросить:</b>\n• Чем джемпер отличается от свитера?\n• Что теплее — шерсть или акрил?\n• Как стирать кашемир?\n• Расскажи о кардигане\n• Какой состав лучше для зимы?\n\nПросто напишите вопрос!`;
}

async function broadcastNewsToBots(article) {
  const subs = readSubscribers();
  console.log(`[Broadcast] Sending to ${subs.tg.length} TG and ${subs.max.length} MAX subscribers`);
  
  const newsText = `📰 <b>Новая публикация</b>\n\n<b>${article.title}</b>\n\n${article.text}\n\n<i>${article.date || ""}</i>`;
  const plainText = `📰 Новая публикация\n\n${article.title}\n\n${article.text}\n\n${article.date || ""}`;
  
  for (const chatId of subs.tg) {
    try {
      const API = `https://api.telegram.org/bot${TG_TOKEN}`;
      await fetch(`${API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: newsText, parse_mode: "HTML" })
      });
      console.log(`[Broadcast] TG sent to ${chatId}`);
    } catch(e) { console.log(`[Broadcast] TG error for ${chatId}:`, e.message); }
  }
  
  for (const userId of subs.max) {
    try {
      const API = "https://platform-api.max.ru";
      const url = new URL(`${API}/messages`);
      url.searchParams.set("user_id", userId);
      await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: MAX_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ text: plainText })
      });
      console.log(`[Broadcast] MAX sent to ${userId}`);
    } catch(e) { console.log(`[Broadcast] MAX error for ${userId}:`, e.message); }
  }
}

// ── Telegram Bot ──────────────────────────────────────────────────────────
async function telegramBot() {
  if (!TG_TOKEN) { console.log("TG disabled"); return; }
  const API = `https://api.telegram.org/bot${TG_TOKEN}`;
  let offset = 0;

  async function tgSend(chatId, text, keyboard) {
    const body = { chat_id: chatId, text, parse_mode: "HTML" };
    if (keyboard) body.reply_markup = { inline_keyboard: keyboard };
    await fetch(`${API}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  }

  function menu() { return [[{ text: "📋 Заказать", callback_data: "order" }, { text: "🧶 Энциклопедия", callback_data: "encyclopedia" }], [{ text: "📞 Позвонить", callback_data: "contact" }]]; }
  function encMenu() { return [[{ text: "↩️ Меню", callback_data: "menu" }, { text: "🧶 Спросить ещё", callback_data: "encyclopedia" }]]; }
  function catMenu() { const rows = []; for (let i = 0; i < PRODUCTS.length; i += 2) rows.push(PRODUCTS.slice(i, i + 2).map(p => ({ text: p.name, callback_data: "cat:" + p.name }))); rows.push([{ text: "↩️ Меню", callback_data: "menu" }]); return rows; }

  async function tgSendPhoto(chatId, filePath, caption) {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("photo", new Blob([fs.readFileSync(filePath)]), require("path").basename(filePath));
    if (caption) form.append("caption", caption);
    await fetch(`${API}/sendPhoto`, { method: "POST", body: form }).catch(() => {});
  }

  const encSessions = new Set();
  console.log("TG bot started");
  while (true) {
    try {
      const resp = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
      const data = await resp.json();
      if (!data.ok || !data.result) { await new Promise(r => setTimeout(r, 2000)); continue; }
      for (const u of data.result) {
        offset = u.update_id + 1;
        if (u.callback_query) {
          const cb = u.callback_query;
          const cid = cb.message.chat.id;
          addSubscriber("tg", cid);
          await fetch(`${API}/answerCallbackQuery?callback_query_id=${cb.id}`);
          if (cb.data === "contact") { encSessions.delete(cid); await tgSend(cid, DESIGNER + " — дизайнер ателье «ЗАВЯЗЬ»\n\n📞 " + PHONE, menu()); }
          else if (cb.data === "order") { encSessions.delete(cid); await tgSend(cid, "Выберите изделие 👇", catMenu()); }
          else if (cb.data.startsWith("cat:")) { const name = cb.data.slice(4); const p = PRODUCTS.find(x => x.name === name); if (p) { await tgSendPhoto(cid, __dirname + "/img/" + p.img, `${p.name}\n${p.price}\n\n📞 Для заказа: ${PHONE}`); await tgSend(cid, "Что ещё интересует?", menu()); } }
          else if (cb.data === "menu") { encSessions.delete(cid); await tgSend(cid, "Главное меню:", menu()); }
          else if (cb.data === "encyclopedia") { encSessions.add(cid); await tgSend(cid, encIntro(), encMenu()); }
        } else if (u.message?.text) {
          const cid = u.message.chat.id; const text = u.message.text.trim();
          addSubscriber("tg", cid);
          if (text === "/start") { await tgSend(cid, "Добро пожаловать в ателье «ЗАВЯЗЬ»! 🧶\n\nЯ помогу с выбором трикотажа, расскажу о пряже и материалах.", menu()); }
          else if (encSessions.has(cid)) { const a = await askAI(text, true); await tgSend(cid, a, encMenu()); }
          else { const a = await askAI(text); await tgSend(cid, a, menu()); }
        }
      }
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
  }
}

// ── MAX Bot ───────────────────────────────────────────────────────────────
async function maxBot() {
  if (!MAX_TOKEN) { console.log("MAX disabled"); return; }
  const API = "https://platform-api.max.ru";
  let marker = null;

  async function mxSend(userId, text, keyboard) {
    const url = new URL(`${API}/messages`); url.searchParams.set("user_id", userId);
    const body = { text };
    if (keyboard) body.attachments = [keyboard];
    await fetch(url.toString(), { method: "POST", headers: { Authorization: MAX_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  }

  function menu() { const rows = [[{ type: "callback", text: "📋 Заказать", payload: "order" }, { type: "callback", text: "🧶 Энциклопедия", payload: "encyclopedia" }], [{ text: "📞 Позвонить", payload: "contact" }]]; return { type: "inline_keyboard", payload: { buttons: rows } }; }
  function encMenu() { return { type: "inline_keyboard", payload: { buttons: [[{ type: "callback", text: "↩️ Меню", payload: "menu" }, { type: "callback", text: "🧶 Спросить ещё", payload: "encyclopedia" }]] } }; }
  function catMenu() { const rows = []; for (let i = 0; i < PRODUCTS.length; i += 2) rows.push(PRODUCTS.slice(i, i + 2).map(p => ({ type: "callback", text: p.name, payload: "cat:" + p.name }))); rows.push([{ type: "callback", text: "↩️ Меню", payload: "menu" }]); return { type: "inline_keyboard", payload: { buttons: rows } }; }

  const encSessions = new Set();
  async function mxSendPhoto(userId, url) {
    const u = new URL(`${API}/messages`); u.searchParams.set("user_id", userId);
    await fetch(u.toString(), { method: "POST", headers: { Authorization: MAX_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ attachments: [{ type: "image", payload: { url } }] }) }).catch(() => {});
  }

  // Verify connection first
  const meResp = await fetch(`${API}/me`, { headers: { Authorization: MAX_TOKEN } }).catch(() => null);
  if (!meResp || !meResp.ok) {
    console.log("MAX bot: /me failed - token invalid or API unreachable");
    return;
  }
  const me = await meResp.json().catch(() => null);
  console.log("MAX bot started:", me?.username || me?.name || "OK");
  while (true) {
    try {
      const params = { timeout: 30, limit: 100 }; if (marker !== null) params.marker = marker;
      const qs = Object.entries(params).map(([k,v]) => `${k}=${v}`).join("&");
      const resp = await fetch(`${API}/updates?${qs}`, { headers: { Authorization: MAX_TOKEN } });
      const data = await resp.json();
      if (!data.updates) { console.log("MAX poll: no updates field, response:", JSON.stringify(data).slice(0, 200)); }
      if (data.marker) marker = data.marker;
      for (const u of data.updates || []) {
        if (u.update_type === "message_callback") { console.log("MAX callback FULL:", JSON.stringify(u.callback)); }
        if (u.update_type === "bot_started" && u.user) {
          addSubscriber("max", u.user.user_id);
          await mxSend(u.user.user_id, "Добро пожаловать в ателье «ЗАВЯЗЬ»! 🧶\n\nЯ помогу с выбором трикотажа, расскажу о пряже. Что интересует?", menu());
        } else if (u.update_type === "message_created" && u.message?.body?.text) {
          const uid = u.message.sender.user_id; const text = u.message.body.text.trim();
          addSubscriber("max", uid);
          if (encSessions.has(uid)) { const a = await askAI(text, true); await mxSend(uid, a, encMenu()); }
          else { const a = await askAI(text); await mxSend(uid, a, menu()); }
        } else if (u.update_type === "message_callback" && u.callback) {
          const uid = u.callback.user.user_id; const p = u.callback.payload || u.callback.data || "";
          addSubscriber("max", uid);
          if (p === "contact") { encSessions.delete(uid); await mxSend(uid, DESIGNER + " — дизайнер ателье ЗАВЯЗЬ\n\n📞 " + PHONE, menu()); }
          else if (p === "order") { encSessions.delete(uid); await mxSend(uid, "Выберите изделие 👇", catMenu()); }
          else if (p.startsWith("cat:")) { const name = p.slice(4); const prod = PRODUCTS.find(x => x.name === name); if (prod) { await mxSend(uid, `${prod.name}\n${prod.price}\n\n📞 Для заказа: ${PHONE}`); const cdnUrl = "https://cdn.jsdelivr.net/gh/vakukushin-a11y/zavyaz-site@main/" + encodeURIComponent(prod.img); await mxSendPhoto(uid, cdnUrl); await mxSend(uid, "Что ещё интересует?", menu()); } }
          else if (p === "menu" || p === "menu:main") { encSessions.delete(uid); await mxSend(uid, "Главное меню:", menu()); }
          else if (p === "encyclopedia") { encSessions.add(uid); await mxSend(uid, encIntro(), encMenu()); }
        }
      }
    } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
  }
}

app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
  const os = require("os");
  const ifaces = os.networkInterfaces();
  console.log("\n📡 Доступ из домашней сети:");
  Object.keys(ifaces).forEach(name => {
    ifaces[name].forEach(iface => {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`   http://${iface.address}:${PORT}/admin   ← админка CMS`);
        console.log(`   http://${iface.address}:${PORT}          ← API`);
      }
    });
  });
  console.log(`\n🔑 Пароль CMS: zavyz2026`);
  console.log(`\nЗапуск ботов...\n`);
  telegramBot();
  maxBot();
  
  // Автоматическая загрузка новостей отключена
});
