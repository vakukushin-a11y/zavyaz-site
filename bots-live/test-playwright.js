const playwrightScraper = require('./playwright-scraper');

const sites = [
  { name: "Dzen.ru", url: "https://dzen.ru/search?text=трикотаж" },
  { name: "Star-tex.ru", url: "https://star-tex.ru/" },
  { name: "TheSymbol.ru", url: "https://thesymbol.ru/" },
  { name: "Grazia.ru", url: "https://grazia.ru/" },
  { name: "Ramonki.ru", url: "https://ramonki.ru/" },
];

(async () => {
  console.log("Тестируем Playwright парсинг...\n");
  
  for (const site of sites) {
    console.log(`\n=== ${site.name} ===`);
    try {
      const articles = await playwrightScraper.scrapeArticleList(site.url);
      console.log(`Найдено статей: ${articles.length}`);
      
      if (articles.length > 0) {
        console.log("Примеры:");
        articles.slice(0, 3).forEach((a, i) => {
          console.log(`  ${i+1}. ${a.title.substring(0, 60)}...`);
        });
        
        // Тестируем парсинг первой статьи
        if (articles[0]) {
          const full = await playwrightScraper.scrapePage(articles[0].href);
          if (full) {
            console.log(`\nПервая статья:`);
            console.log(`  Заголовок: ${full.title}`);
            console.log(`  Текст: ${full.text.substring(0, 200)}...`);
            console.log(`  Длина: ${full.text.length} симв.`);
          }
        }
      }
    } catch(e) {
      console.log(`ОШИБКА: ${e.message}`);
    }
  }
  
  await playwrightScraper.close();
  console.log("\n=== Тест завершен ===");
})();
