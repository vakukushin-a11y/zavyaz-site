const playwrightScraper = require('./playwright-scraper');

const sites = [
  { name: "Vogue US", url: "https://www.vogue.com/" },
  { name: "WWD", url: "https://wwd.com/" }
];

(async () => {
  console.log("Тестируем Vogue US и WWD...\n");
  
  for (const site of sites) {
    console.log(`\n=== ${site.name} ===`);
    try {
      const articles = await playwrightScraper.scrapeArticleList(site.url);
      console.log(`Найдено статей: ${articles.length}`);
      
      if (articles.length > 0) {
        console.log("Примеры:");
        articles.slice(0, 5).forEach((a, i) => {
          console.log(`  ${i+1}. ${a.title.substring(0, 80)}`);
        });
        
        // Тестируем парсинг первой статьи
        if (articles[0]) {
          const full = await playwrightScraper.scrapePage(articles[0].href);
          if (full) {
            console.log(`\nПервая статья:`);
            console.log(`  Заголовок: ${full.title}`);
            console.log(`  Текст: ${full.text.substring(0, 300)}...`);
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
