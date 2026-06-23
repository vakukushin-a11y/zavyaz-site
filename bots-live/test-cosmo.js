const playwrightScraper = require('./playwright-scraper');

const KNITWEAR_KEYWORDS = [
  "трикотаж", "вязан", "пряжа", "свитер", "кардиган", "джемпер", "пуловер",
  "шерсть", "вязк", "спицы", "меринос", "кашемир", "хлопок", "акрил", "вискоза",
  "палантин", "снуд", "плед", "туника", "шарф", "шапк",
];

(async () => {
  console.log("Тестируем Cosmo.ru...\n");
  
  const articles = await playwrightScraper.scrapeArticleList("https://www.cosmo.ru/");
  console.log(`Найдено статей: ${articles.length}\n`);
  
  let knitCount = 0;
  for (const article of articles.slice(0, 10)) {
    try {
      const full = await playwrightScraper.scrapePage(article.href);
      if (full && full.text && full.text.length > 200) {
        const combined = (full.title + " " + full.text).toLowerCase();
        const hasKeyword = KNITWEAR_KEYWORDS.some(kw => combined.includes(kw));
        if (hasKeyword) {
          knitCount++;
          console.log(`✓ [Трикотаж] ${full.title}`);
          console.log(`  Текст: ${full.text.substring(0, 150)}...\n`);
        } else {
          console.log(`✗ [Не трикотаж] ${full.title}`);
        }
      }
    } catch(e) {
      console.log(`Ошибка: ${e.message}`);
    }
  }
  
  console.log(`\n=== ИТОГО: ${knitCount} трикотажных статей из ${Math.min(articles.length, 10)} ===`);
  
  await playwrightScraper.close();
})();
