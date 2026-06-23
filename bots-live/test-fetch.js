const SCRAPE_SOURCES = [
  { name: "PeopleTalk Трикотаж", urls: [
    "https://peopletalk.ru/tag/trikotazh/",
    "https://peopletalk.ru/tag/trikotazh/page/2/",
    "https://peopletalk.ru/tag/trikotazh/page/3/",
    "https://peopletalk.ru/tag/trikotazh/page/4/",
    "https://peopletalk.ru/tag/trikotazh/page/5/"
  ] },
  { name: "Knitka.ru", urls: [
    "https://knitka.ru/",
    "https://knitka.ru/page/2/",
    "https://knitka.ru/page/3/",
    "https://knitka.ru/page/4/",
    "https://knitka.ru/page/5/"
  ] },
  { name: "Мода 24/7", urls: [
    "https://moda247.ru/news/",
    "https://moda247.ru/news/page/2/",
    "https://moda247.ru/news/page/3/",
    "https://moda247.ru/news/page/4/",
    "https://moda247.ru/news/page/5/"
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
];

const KNITWEAR_KEYWORDS = [
  "трикотаж", "вязан", "пряжа", "свитер", "кардиган", "джемпер", "пуловер",
  "шерсть", "вязк", "спицы", "меринос", "кашемир", "хлопок", "акрил", "вискоза",
  "палантин", "снуд", "плед", "туника", "шарф", "шапк",
];

async function scrapeArticlePage(url) {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    const html = await resp.text();
    
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match ? h1Match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
    
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(html)) !== null) {
      let text = match[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      if (text.length > 100 && 
          !text.includes("window.") && 
          !text.includes("function") &&
          !text.includes("cookie")) {
        paragraphs.push(text);
      }
    }
    
    const fullText = paragraphs.join("\n\n");
    
    if (title && fullText.length > 200) {
      return { title, text: fullText };
    }
    return null;
  } catch(e) {
    return null;
  }
}

async function scrapeSite(source) {
  try {
    const url = source.urls[0]; // Всегда берем первую страницу для теста
    console.log(`\n=== ${source.name} ===`);
    console.log(`URL: ${url}`);
    
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    const html = await resp.text();
    const articles = [];
    
    // Получаем домен источника
    const sourceDomain = new URL(url).hostname;
    
    const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    const articleLinks = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      let title = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      
      // Фильтруем ссылки - берем только внутренние ссылки с хорошими заголовками
      try {
        const linkDomain = new URL(href).hostname;
        if (linkDomain === sourceDomain &&
            title.length >= 20 && title.length < 300 &&
            !href.match(/\.(jpg|png|gif|svg|css|js|ico|pdf)/i) &&
            !href.match(/pinterest|twitter|facebook|linkedin|instagram|youtube|vkontakte|t\.me/) &&
            !href.includes('/tag/') && !href.includes('/category/') && !href.includes('/author/')) {
          articleLinks.push({ title, link: href });
          if (articleLinks.length > 15) break;
        }
      } catch(e) {}
    }
    
    console.log(`Найдено ссылок на статьи: ${articleLinks.length}`);
    
    for (const article of articleLinks.slice(0, 3)) { // Только первые 3 для теста
      try {
        const fullArticle = await scrapeArticlePage(article.link);
        if (fullArticle) {
          const combined = fullArticle.title.toLowerCase();
          const hasKeyword = KNITWEAR_KEYWORDS.some(kw => combined.includes(kw));
          articles.push({
            title: fullArticle.title,
            link: article.link,
            text: fullArticle.text,
            hasKeyword
          });
          console.log(`  ✓ ${fullArticle.title.substring(0, 60)}... [${hasKeyword ? 'трикотаж' : 'другое'}]`);
        }
      } catch(e) {}
    }
    
    console.log(`Успешно загружено: ${articles.length} статей`);
    return articles;
  } catch(e) { 
    console.log(`Ошибка: ${e.message}`);
    return []; 
  }
}

async function test() {
  console.log("Тестируем все источники...\n");
  
  for (const src of SCRAPE_SOURCES) {
    await scrapeSite(src);
  }
  
  console.log("\n=== Тест завершен ===");
}

test().catch(console.error);
