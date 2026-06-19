export interface NewsSource {
  name: string;
  url: string;
  type: "ru" | "int";
}

export const NEWS_SOURCES: NewsSource[] = [
  // ── Российские источники ──────────────────────────────────────────────────
  {
    name: "ELLE Россия",
    url: "https://www.elle.ru/rss/",
    type: "ru",
  },
  {
    name: "Vogue Россия",
    url: "https://www.vogue.ru/rss/",
    type: "ru",
  },
  {
    name: "FashionUnited Россия",
    url: "https://ru.fashionunited.com/rss",
    type: "ru",
  },
  {
    name: "Cosmo Россия",
    url: "https://www.cosmo.ru/rss/all.rss",
    type: "ru",
  },

  // ── Международные источники ───────────────────────────────────────────────
  {
    name: "WWD",
    url: "https://wwd.com/feed/",
    type: "int",
  },
  {
    name: "Knitting Industry",
    url: "https://www.knitting-industry.com/feed/",
    type: "int",
  },
  {
    name: "Fashionista",
    url: "https://fashionista.com/feed",
    type: "int",
  },
  {
    name: "Vogue US",
    url: "https://www.vogue.com/feed/rss",
    type: "int",
  },
  {
    name: "FashionUnited",
    url: "https://fashionunited.com/rss",
    type: "int",
  },
];

export const KNITWEAR_KEYWORDS_RU = [
  "трикотаж",
  "вязан",
  "пряжа",
  "свитер",
  "кардиган",
  "джемпер",
  "пуловер",
  "шерсть",
  "вязка",
  "трикотажн",
  "вязальн",
  "спицы",
  "крючок",
  "мерино",
];

export const KNITWEAR_KEYWORDS_EN = [
  "knit",
  "knitwear",
  "yarn",
  "wool",
  "sweater",
  "cardigan",
  "pullover",
  "jumper",
  "crochet",
  "cashmere",
  "merino",
  "textile",
  "weave",
  "fabric",
];
