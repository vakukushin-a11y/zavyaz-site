const SCRAPE_SOURCES = [
  { name: "Мода 24/7", url: "https://moda247.ru/" },
  { name: "ProFashion", url: "https://profashion.ru/" },
  { name: "InterModa", url: "https://www.intermoda.ru/" },
  { name: "Осинка", url: "https://www.osinka.ru/" },
  { name: "Ткани России", url: "https://tkani.ru/news/" },
  { name: "Fashion Network RU", url: "https://ru.fashionnetwork.com/news/" },
  { name: "VedaModa", url: "https://vedamoda.com/" },
  { name: "Moda.ru", url: "https://moda.ru/" }
];

async function scrapeSite(source) {
  try {
    const resp = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    const html = await resp.text();
    const articles = [];
    
    // Извлекаем все параграфы <p> со страницы
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null) {
      let pText = pMatch[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      // Фильтруем мусор: JavaScript, навигация, реклама
      if (pText.length > 200 && 
          !pText.includes("window.") && 
          !pText.includes("function") &&
          !pText.includes("var ") &&
          !pText.includes("cookie") &&
          !pText.includes("Меню") &&
          !pText.includes("Навигация") &&
          !pText.includes("Реклама")) {
        paragraphs.push(pText);
      }
    }
    
    // Извлекаем заголовки h1-h3
    const headings = [];
    const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
    let hMatch;
    while ((hMatch = headingRegex.exec(html)) !== null) {
      let title = hMatch[2]
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (title.length >= 20 && title.length < 300) {
        headings.push(title);
      }
    }
    
    // Создаем статьи из параграфов
    if (paragraphs.length > 0) {
      const articlesCount = Math.min(paragraphs.length, 10);
      for (let i = 0; i < articlesCount; i++) {
        const title = headings[i] || `Новость ${i + 1}`;
        articles.push({
          title: title,
          link: "",
          text: paragraphs[i]
        });
      }
    }
    
    // Если не нашли параграфы, ищем ссылки с текстом
    if (articles.length === 0) {
      const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        let title = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        if (title.length < 30 || title.length > 300) continue;
        if (href.match(/\.(jpg|png|gif|svg|css|js|ico|pdf)/i)) continue;
        if (href.match(/pinterest|twitter|facebook|linkedin|instagram|youtube|vkontakte|t\.me/)) continue;
        articles.push({ title, link: href, text: title });
        if (articles.length > 50) break;
      }
    }
    
    return articles.slice(0, 20).map(a => ({ ...a, source: source.name }));
  } catch(e) { 
    console.log(`Ошибка парсинга ${source.name}:`, e.message);
    return []; 
  }
}

async function test() {
  console.log("Тестируем парсинг полного текста статей...\n");
  
  for (const source of SCRAPE_SOURCES) {
    console.log(`\n=== ${source.name} (${source.url}) ===`);
    const articles = await scrapeSite(source);
    
    if (articles.length === 0) {
      console.log("❌ Не найдено статей");
      continue;
    }
    
    console.log(`✅ Найдено ${articles.length} статей\n`);
    
    // Показываем первые 3 статьи
    articles.slice(0, 3).forEach((article, idx) => {
      console.log(`${idx + 1}. ${article.title}`);
      console.log(`   Текст: ${article.text.substring(0, 200)}...`);
      console.log(`   Длина текста: ${article.text.length} символов\n`);
    });
  }
}

test().catch(console.error);
