import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Send, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

const DAILY_LIMIT = 10;

function todayKey(): string {
  return `kb_used_${new Date().toISOString().slice(0, 10)}`;
}

function getUsed(): number {
  return parseInt(localStorage.getItem(todayKey()) ?? "0", 10);
}

function incUsed(): number {
  const key = todayKey();
  const next = getUsed() + 1;
  localStorage.setItem(key, String(next));
  return next;
}

const BASE = import.meta.env.BASE_URL;

// ── Daily Facts ───────────────────────────────────────────────────────────────
const DAILY_FACTS = [
  "🐑 Одна овца меринос даёт до 10 кг шерсти в год — этого хватит на 2–3 свитера.",
  "📍 Слово «кардиган» появилось в честь лорда Кардигана — британского генерала Крымской войны 1854 года.",
  "🌿 История вязания насчитывает более 3000 лет — вязаные изделия находили в египетских гробницах!",
  "🧵 Первая вязальная машина изобретена в 1589 году английским священником Уильямом Ли.",
  "❄️ Шерсть согревает даже во влажном состоянии — уникальное свойство среди натуральных волокон.",
  "🦙 Из одной кашемировой козы — всего 150–200 г пряжи в год. Вот почему кашемир такой ценный!",
  "🌊 «Джемпер» — от французского «jupe» (рабочая рубаха английских моряков XIX века).",
  "♻️ Шерстяное изделие разложится в почве примерно за 5 лет. Шерсть — биоразлагаема.",
  "🇳🇴 Узор норвежского свитера был уникален для каждой деревни — по нему определяли, откуда рыбак.",
  "💡 Коко Шанель первой применила трикотаж в haute couture в 1920-х, произведя революцию в моде.",
  "🐪 Верблюжья шерсть не требует частой стирки: достаточно проветрить — запахи улетучиваются сами.",
  "🌱 Хлопок — гипоаллергенное растительное волокно. Лучший выбор для чувствительной кожи.",
];

// ── Quick questions ───────────────────────────────────────────────────────────
const QUICK_QUESTIONS = [
  "Чем отличается джемпер от свитера?",
  "Что теплее — шерсть или акрил?",
  "Какой состав лучше для зимы?",
  "Что такое меринос и чем он особенный?",
  "Чем кардиган отличается от жакета?",
  "Как правильно стирать шерстяные изделия?",
  "Что такое вискоза?",
  "Как выбрать трикотаж для офиса?",
  "Расскажи интересный факт о вязании 😊",
  "Сравни шерсть и кашемир",
];

// ── Encyclopedia data per category ────────────────────────────────────────────
interface CategoryInfo {
  description: string;
  materials: string;
  season: string;
  seasonEmoji: string;
  care: string;
  differences: string;
  history: string;
  usage: string;
  filterGroup: "accessories" | "clothing" | "home";
}

const PRODUCT_INFO: Record<string, CategoryInfo> = {
  "Джемперы": {
    description: "Верхнее трикотажное изделие с длинными рукавами без застёжки — надевается через голову.",
    materials: "Шерсть, меринос, хлопок, акрил, смеси",
    season: "Зима, демисезон",
    seasonEmoji: "🍂❄️",
    care: "Деликатная стирка 30°C, сушить горизонтально",
    differences: "Тоньше свитера, обычно без высокого воротника. В отличие от кардигана — нет застёжки.",
    history: "Появился у английских рыбаков XIX века. В 1920-х Коко Шанель превратила его в модный предмет гардероба.",
    usage: "Офис, casual, повседневный образ",
    filterGroup: "clothing",
  },
  "Свитеры": {
    description: "Тёплое вязаное изделие с длинными рукавами и высоким воротником или горловиной.",
    materials: "Шерсть, меринос, кашемир, акрил",
    season: "Зима",
    seasonEmoji: "❄️",
    care: "Деликатная стирка 30°C, не отжимать, сушить лёжа",
    differences: "Теплее и плотнее джемпера, чаще с воротником-стойкой.",
    history: "Классика рыбаков Британских островов XIX века. Aran sweater из Ирландии — мировая икона стиля.",
    usage: "Зимний гардероб, горные прогулки, уютный домашний образ",
    filterGroup: "clothing",
  },
  "Кардиганы": {
    description: "Вязаная кофта с застёжкой спереди (пуговицы или молния) и длинными рукавами.",
    materials: "Шерсть, хлопок, акрил, вискоза, смеси",
    season: "Круглогодично",
    seasonEmoji: "🌸🍂❄️",
    care: "Деликатная стирка 30°C, хранить сложенным, не на вешалке",
    differences: "Главное отличие от джемпера — застёжка. Легко снять в тепле, не нарушив причёску.",
    history: "Назван в честь лорда Кардигана (1850-е), носившего вязаный жилет в Крымской кампании.",
    usage: "Офис, деловой casual, слоистые образы",
    filterGroup: "clothing",
  },
  "Платья": {
    description: "Цельное трикотажное изделие от плеч до бёдер или ниже. Свобода движений и элегантность.",
    materials: "Вискоза, хлопок, акрил, шерсть (зимние модели)",
    season: "Круглогодично",
    seasonEmoji: "🌸☀️🍂❄️",
    care: "Деликатная стирка, хранить на вешалке",
    differences: "Трикотажное платье тянется и облегает лучше тканого, не стесняет движений.",
    history: "Трикотажные платья вошли в моду в 1920-х — Шанель первой применила трикотаж в haute couture.",
    usage: "Офис, вечерние выходы, casual, деловые встречи",
    filterGroup: "clothing",
  },
  "Туники": {
    description: "Длинный вязаный топ, покрывающий бёдра. Носится с леггинсами, брюками или как платье.",
    materials: "Хлопок, вискоза, акрил, лёгкие смеси",
    season: "Демисезон, лето",
    seasonEmoji: "🌸☀️",
    care: "Деликатная стирка 30°C, хранить сложенной",
    differences: "Длиннее топа, короче платья. Более свободный силуэт, чем у платья.",
    history: "Один из древнейших предметов одежды — в Риме туника была основой гардероба. Возрождение в 1960-х.",
    usage: "Пляж, casual, образы с леггинсами",
    filterGroup: "clothing",
  },
  "Брюки, кофты и другая одежда": {
    description: "Вязаные брюки, кофты и любые изделия по вашей задумке — всё, что придумаете, можно связать!",
    materials: "Шерсть, хлопок, акрил, смеси — на выбор",
    season: "Зависит от изделия",
    seasonEmoji: "🌸☀️🍂❄️",
    care: "Деликатная стирка, сушить горизонтально",
    differences: "Изделие на заказ — уникальный силуэт, цвет и узор под ваши пожелания.",
    history: "Вязаные чулки были роскошью в Европе XV–XVI вв. Вязаные брюки — традиция горских народов.",
    usage: "Авторские образы, спорт, повседневный стиль",
    filterGroup: "clothing",
  },
  "Палантины": {
    description: "Широкий длинный шарф-накидка (~50×200 см). Носится на плечах, шее или как шаль.",
    materials: "Шерсть, вискоза, акрил, кашемир",
    season: "Демисезон, зима",
    seasonEmoji: "🍂❄️",
    care: "Деликатная стирка или химчистка, хранить сложенным",
    differences: "Шире и длиннее шарфа. Может заменить лёгкую накидку или шаль.",
    history: "Пришёл из Персии. В Европе стал модным в XVIII веке благодаря индийским кашемировым шалям.",
    usage: "Театр, прогулки, выходы, деловой образ",
    filterGroup: "accessories",
  },
  "Шарфы и шапки": {
    description: "Классические трикотажные аксессуары: шапки любых фасонов и шарфы разной длины и ширины.",
    materials: "Шерсть, акрил, хлопок, меринос",
    season: "Зима, поздняя осень",
    seasonEmoji: "❄️🍂",
    care: "Ручная стирка 30°C, сушить в расправленном виде",
    differences: "Бесконечное разнообразие: шапки-бини, с помпоном, с отворотом, берет.",
    history: "Вязаные шапки известны с XII века. Вязаный шарф стал популярен в XIX веке.",
    usage: "Зимние прогулки, спорт, ежедневный гардероб",
    filterGroup: "accessories",
  },
  "Снуды": {
    description: "Шарф-труба без концов — петля, надеваемая через голову. Не развязывается и не путается.",
    materials: "Шерсть, акрил, хлопок, мохер, смеси",
    season: "Зима, демисезон",
    seasonEmoji: "❄️🍂",
    care: "Ручная стирка, сушить в расправленном виде",
    differences: "Удобнее шарфа — нет концов, не нужно завязывать. Компактнее, не сползает.",
    history: "Snood в XVI веке — шотландская сетка для волос. Современный снуд-шарф появился в 1970-х.",
    usage: "Прогулки, спорт, повседневный образ",
    filterGroup: "accessories",
  },
  "Косынки": {
    description: "Треугольный платок, носимый на голове, шее или плечах. Лёгкий и декоративный аксессуар.",
    materials: "Хлопок, вискоза, лёгкие смеси",
    season: "Демисезон, лето",
    seasonEmoji: "🌸☀️",
    care: "Деликатная стирка, гладить через влажную ткань",
    differences: "Треугольная форма отличает от шарфа. Более декоративна, легче по весу.",
    history: "Косынки носили ещё в Риме. Мировые иконы стиля — Одри Хепберн и Грейс Келли.",
    usage: "Лёгкий сезон, ретро-образы, украшение шеи и волос",
    filterGroup: "accessories",
  },
  "Пледы": {
    description: "Большое вязаное полотно для уюта и тепла. Украшает интерьер и согревает в холодное время.",
    materials: "Шерсть, акрил, хлопок, мохер, объёмная пряжа",
    season: "Круглогодично (для дома)",
    seasonEmoji: "🏠",
    care: "Деликатная стирка или химчистка, хранить свёрнутым",
    differences: "Вязаный плед «дышит» лучше синтетического. Уникальный узор ручной работы.",
    history: "Плед (plaid) — из Шотландии, шерстяное полотно-одеяло, часть килта. В интерьерах с XIX века.",
    usage: "Диван, кресло, подарок, декор интерьера",
    filterGroup: "home",
  },
};

const FILTER_GROUPS = {
  accessories: ["Палантины", "Шарфы и шапки", "Снуды", "Косынки"],
  clothing: ["Джемперы", "Свитеры", "Кардиганы", "Платья", "Туники", "Брюки, кофты и другая одежда"],
  home: ["Пледы"],
};

const FILTER_LABELS: Record<string, string> = {
  all: "Все",
  accessories: "Аксессуары",
  clothing: "Одежда",
  home: "Домашний",
};

const ITEMS_PER_PAGE = 5;

// ── Types ─────────────────────────────────────────────────────────────────────
interface CatalogCategory {
  name: string;
  images: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── ProductCard ───────────────────────────────────────────────────────────────
function ProductCard({
  category,
  onAskAbout,
}: {
  category: CatalogCategory;
  onAskAbout: (q: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [imgError, setImgError] = useState(false);
  const info = PRODUCT_INFO[category.name];
  const img = category.images[0];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* Image */}
      <div className="h-44 bg-stone-100 shrink-0 overflow-hidden">
        {img && !imgError ? (
          <img
            src={img}
            alt={category.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-stone-300">🧶</div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4 gap-2">
        {/* Season + name */}
        <div>
          {info && (
            <span className="text-xs text-stone-400 font-medium">{info.seasonEmoji} {info.season}</span>
          )}
          <h3 className="text-base font-bold text-stone-800 mt-0.5">{category.name}</h3>
        </div>

        {/* Description */}
        {info && (
          <p className="text-sm text-stone-600 leading-relaxed line-clamp-2">{info.description}</p>
        )}

        {/* Info rows */}
        {info && (
          <div className="flex flex-col gap-1 text-xs text-stone-500">
            <div className="flex gap-1.5 items-start">
              <span className="shrink-0">🧵</span>
              <span>{info.materials}</span>
            </div>
            <div className="flex gap-1.5 items-start">
              <span className="shrink-0">🧺</span>
              <span>{info.care}</span>
            </div>
            <div className="flex gap-1.5 items-start">
              <span className="shrink-0">≠</span>
              <span className="line-clamp-2">{info.differences}</span>
            </div>
          </div>
        )}

        {/* History collapsible */}
        {info && (
          <div className="mt-auto pt-2 border-t border-stone-50">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              История
            </button>
            {showHistory && (
              <p className="mt-2 text-xs text-stone-500 leading-relaxed">{info.history}</p>
            )}
          </div>
        )}

        {/* Ask AI button */}
        <button
          onClick={() => onAskAbout(`Расскажи подробнее о ${category.name.toLowerCase()} — материалы, история, как выбрать`)}
          className="mt-1 text-xs text-stone-400 hover:text-rose-500 transition-colors text-left"
        >
          🤖 Спросить у AI →
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[90%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-stone-800 text-white rounded-br-sm"
            : "bg-stone-100 text-stone-800 rounded-bl-sm"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function KnowledgePage() {
  const [dailyFact] = useState(
    () => DAILY_FACTS[Math.floor(Math.random() * DAILY_FACTS.length)]
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Привет! Я — Энциклопедия трикотажа 🧶\n\nЗадайте мне любой вопрос о трикотажных изделиях, пряже, составах или уходе. Расскажу всё — с историей, фактами и полезными сравнениями!\n\nИли нажмите на один из быстрых вопросов ниже 👇",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [usedCount, setUsedCount] = useState(() => getUsed());
  const remaining = Math.max(0, DAILY_LIMIT - usedCount);
  const limitReached = remaining === 0;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentPage, setCurrentPage] = useState(0);
  const [activeFilter, setActiveFilter] = useState<"all" | "accessories" | "clothing" | "home">("all");

  const { data: catalog = [] } = useQuery<CatalogCategory[]>({
    queryKey: ["catalog"],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/products/categories`);
      if (!res.ok) throw new Error("Failed to fetch catalog");
      return res.json();
    },
  });

  const filteredCatalog = useMemo(() => {
    if (activeFilter === "all") return catalog;
    const allowed = FILTER_GROUPS[activeFilter];
    return catalog.filter((c) => allowed.includes(c.name));
  }, [catalog, activeFilter]);

  const totalPages = Math.ceil(filteredCatalog.length / ITEMS_PER_PAGE);
  const currentItems = filteredCatalog.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [activeFilter]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (msg: string) => {
    if (!msg.trim() || isLoading || limitReached) return;
    const userMsg: ChatMessage = { role: "user", content: msg.trim() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setIsLoading(true);

    const newUsed = incUsed();
    setUsedCount(newUsed);

    try {
      const res = await fetch(`${BASE}api/knowledge/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg.trim(),
          history: messages.slice(-8),
        }),
      });

      if (res.status === 429) {
        setMessages([
          ...updatedHistory,
          { role: "assistant", content: "🌙 Вы использовали все 10 бесплатных вопросов на сегодня. Возвращайтесь завтра — я уже буду ждать!" },
        ]);
        return;
      }

      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as { reply: string; remaining?: number };
      setMessages([...updatedHistory, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([
        ...updatedHistory,
        { role: "assistant", content: "Извините, произошла ошибка. Попробуйте ещё раз 🙏" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleQuickQuestion = (q: string) => {
    sendMessage(q);
  };

  return (
    <div className="flex h-screen bg-stone-50 text-foreground overflow-hidden">

      {/* ── Left: Encyclopedia Chat (30%) ───────────────────────────────────── */}
      <div className="w-[30%] shrink-0 flex flex-col h-full border-r border-border bg-card">

        {/* Header */}
        <header className="flex flex-col gap-2 px-5 py-4 border-b border-border bg-card shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧶</span>
            <div>
              <h1 className="text-base font-bold text-stone-800 leading-tight">Энциклопедия трикотажа</h1>
              <p className="text-xs text-stone-400">AI-эксперт по пряже и изделиям</p>
            </div>
          </div>

          {/* Daily fact */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold block mb-0.5">✨ Факт дня</span>
            {dailyFact}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
          {isLoading && (
            <div className="flex justify-start mb-3">
              <div className="bg-stone-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                <span className="text-sm text-stone-400">Думаю…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick questions */}
        <div className="shrink-0 px-4 pb-2 flex flex-col gap-1.5">
          <p className="text-xs text-stone-400 font-medium mb-1">Быстрые вопросы:</p>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleQuickQuestion(q)}
                disabled={isLoading}
                className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50 text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Limit banner */}
        {limitReached && (
          <div className="shrink-0 mx-4 mb-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 text-center">
            🌙 Лимит 10 вопросов на сегодня исчерпан. Возвращайтесь завтра!
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="shrink-0 flex flex-col gap-1 px-4 py-3 border-t border-border">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={limitReached ? "Лимит вопросов исчерпан на сегодня" : "Задайте вопрос о трикотаже…"}
              disabled={isLoading || limitReached}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-full px-4 py-2 text-sm outline-none focus:border-stone-400 focus:ring-0 disabled:opacity-60 placeholder:text-stone-300"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !input.trim() || limitReached}
              className="rounded-full bg-stone-800 hover:bg-stone-700 text-white shrink-0 w-9 h-9 p-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {!limitReached && (
            <p className="text-xs text-stone-400 text-right pr-1">
              Осталось вопросов сегодня: <span className={remaining <= 3 ? "text-amber-500 font-semibold" : ""}>{remaining}</span> из {DAILY_LIMIT}
            </p>
          )}
        </form>
      </div>

      {/* ── Right: Product Encyclopedia (70%) ──────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full min-w-0">

        {/* Header + filters */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-stone-800">Каталог изделий</h2>
            <p className="text-xs text-stone-400">
              {filteredCatalog.length} {filteredCatalog.length === 1 ? "категория" : "категорий"} · стр. {currentPage + 1} из {Math.max(totalPages, 1)}
            </p>
          </div>
          <div className="flex gap-2">
            {(["all", "accessories", "clothing", "home"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeFilter === f
                    ? "bg-stone-800 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </header>

        {/* Cards grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {currentItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-stone-300 text-5xl">
              🧶
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {currentItems.map((cat) => (
                <ProductCard
                  key={cat.name}
                  category={cat}
                  onAskAbout={handleQuickQuestion}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-6 py-4 border-t border-border bg-card">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 0}
              className="rounded-full"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1.5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  className={`w-7 h-7 rounded-full text-sm font-medium transition-colors ${
                    i === currentPage
                      ? "bg-stone-800 text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= totalPages - 1}
              className="rounded-full"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
