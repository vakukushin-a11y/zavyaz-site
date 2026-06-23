const playwrightScraper = require('./playwright-scraper');

const sites = [
  { name: "Нитки.ру", url: "https://nitki.ru/" },
  { name: "Пряжа.ру", url: "https://pryazha.ru/" },
  { name: "Вязание.ру", url: "https://vjazanie.ru/" },
  { name: "Клубок.ру", url: "https://klubok.ru/" },
  { name: "Иголочка.ру", url: "https://igolochka.ru/" },
  { name: "Мир вязания", url: "https://mirknits.ru/" },
];

(async () => {
  console.log("Тестируем специализированные сайты о вязании...\n");
  
  for (const site of sites) {
    console.log(`\n=== ${site.name} ===`);
    try {
      const articles = await playwrightScraper.scrapeArticleList(site.url);
      console.log(`Найдено статей: ${articles.length}`);
      
      if (articles.length > 0) {
        console.log("Примеры:");
        articles.slice(0, 3).forEach((a, i) => {
          console.log(`  ${i+1}. ${a.title.substring(0, 80)}`);
        });
      }
    } catch(e) {
      console.log(`ОШИБКА: ${e.message.substring(0, 100)}`);
    }
  }
  
  await playwrightScraper.close();
  console.log("\n=== Тест завершен ===");
})();
