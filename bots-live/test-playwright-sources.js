const playwrightScraper = require('./playwright-scraper');

const KNITWEAR_KEYWORDS = [
  "трикотаж", "вязан", "пряжа", "свитер", "кардиган", "джемпер", "пуловер",
  "шерсть", "вязк", "спицы", "меринос", "кашемир", "хлопок", "акрил", "вискоза",
  "палантин", "снуд", "плед", "туника", "шарф", "шапк",
];

const sources = [
  { name: "Star-tex.ru", urls: ["https://star-tex.ru/", "https://star-tex.ru/page/2/"], usePlaywright: true },
  { name: "Grazia.ru", urls: ["https://grazia.ru/", "https://grazia.ru/fashion/"], usePlaywright: true },
];

async function getNextUrl(source) {
  if (!source.currentIndex) source.currentIndex = 0;
  const url = source.urls[source.currentIndex % source.urls.length];
  source.currentIndex++;
  return url;
}

async function scrapeSite(source) {
  try {
    const url = await getNextUrl(source);
    console.log(`\n[Scrape] ${source.name}: загружаю ${url}`);
    
    const articles = [];
    const articleList = await playwrightScraper.scrapeArticleList(url);
    console.log(`[Scrape] ${source.name}: найдено ${articleList.length} ссылок на статьи (Playwright)`);
    
    for (const article of articleList) {
      try {
        const fullArticle = await playwrightScraper.scrapePage(article.href);
        if (fullArticle && fullArticle.text && fullArticle.text.length > 200) {
          const combined = (fullArticle.title + " " + fullArticle.text).toLowerCase();
          const hasKeyword = KNITWEAR_KEYWORDS.some(kw => combined.includes(kw));
          if (hasKeyword) {
            articles.push({
              title: fullArticle.title,
              link: article.href,
              text: fullArticle.text,
              source: source.name
            });
          }
        }
        if (articles.length >= 5) break;
      } catch(e) {
        console.log(`  Ошибка при парсинге статьи: ${e.message}`);
      }
    }
    
    console.log(`[Scrape] ${source.name}: успешно загружено ${articles.length} трикотажных статей`);
    return articles;
  } catch(e) { 
    console.log(`[Scrape] Ошибка ${source.name}:`, e.message);
    return []; 
  }
}

(async () => {
  console.log("=== Тест Playwright источников ===\n");
  
  const allArticles = [];
  
  for (const source of sources) {
    const articles = await scrapeSite(source);
    allArticles.push(...articles);
  }
  
  console.log(`\n=== ИТОГО: ${allArticles.length} трикотажных статей ===\n`);
  
  allArticles.forEach((a, i) => {
    console.log(`${i+1}. [${a.source}] ${a.title}`);
    console.log(`   Текст: ${a.text.substring(0, 150)}...\n`);
  });
  
  await playwrightScraper.close();
})();
