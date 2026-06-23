const playwrightScraper = require('./playwright-scraper');

const sites = [
  { name: "Grazia.ru fashion", url: "https://grazia.ru/fashion/" },
  { name: "Grazia.ru trends", url: "https://grazia.ru/trends/" },
  { name: "Harper's Bazaar", url: "https://www.harpersbazaar.ru/" },
  { name: "Elle.ru", url: "https://www.elle.ru/" },
  { name: "Cosmo.ru", url: "https://www.cosmo.ru/" },
];

(async () => {
  console.log("Тестируем модные журналы с Playwright...\n");
  
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
      }
    } catch(e) {
      console.log(`ОШИБКА: ${e.message}`);
    }
  }
  
  await playwrightScraper.close();
  console.log("\n=== Тест завершен ===");
})();
