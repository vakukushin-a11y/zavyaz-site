const playwrightScraper = require('./playwright-scraper');

const sites = [
  { name: "Vogue Russia", url: "https://www.vogue.ru/" },
  { name: "Harper's Bazaar", url: "https://www.harpersbazaar.ru/" },
  { name: "Elle Russia", url: "https://www.elle.ru/" },
  { name: "Marie Claire", url: "https://www.marieclaire.ru/" },
  { name: "Glamour Russia", url: "https://www.glamour.ru/" },
  { name: "InStyle Russia", url: "https://www.instyle.ru/" },
  { name: "Tatler Russia", url: "https://www.tatler.ru/" },
  { name: "GQ Russia", url: "https://www.gq.ru/" },
  { name: "L'Officiel Russia", url: "https://www.lofficiel.ru/" },
  { name: "Buro 24/7", url: "https://www.buro247.ru/" },
  { name: "The Village", url: "https://www.the-village.ru/" },
  { name: "Wonderzine", url: "https://www.wonderzine.ru/" },
  { name: "РБК Стиль", url: "https://style.rbc.ru/" },
  { name: "SNC Magazine", url: "https://www.snc.ru/" },
];

(async () => {
  console.log("Тестируем российские модные журналы...\n");
  
  const results = [];
  
  for (const site of sites) {
    console.log(`\n=== ${site.name} ===`);
    try {
      const articles = await playwrightScraper.scrapeArticleList(site.url);
      console.log(`✓ Найдено статей: ${articles.length}`);
      
      if (articles.length > 0) {
        console.log("Примеры:");
        articles.slice(0, 3).forEach((a, i) => {
          console.log(`  ${i+1}. ${a.title.substring(0, 80)}`);
        });
        results.push({ name: site.name, count: articles.length, status: 'OK' });
      } else {
        results.push({ name: site.name, count: 0, status: 'EMPTY' });
      }
    } catch(e) {
      console.log(`✗ ОШИБКА: ${e.message.substring(0, 100)}`);
      results.push({ name: site.name, count: 0, status: 'ERROR', error: e.message.substring(0, 100) });
    }
  }
  
  console.log("\n\n=== ИТОГИ ===\n");
  console.log("Рабочие сайты:");
  results.filter(r => r.status === 'OK').forEach(r => {
    console.log(`  ✓ ${r.name}: ${r.count} статей`);
  });
  
  console.log("\nПустые сайты:");
  results.filter(r => r.status === 'EMPTY').forEach(r => {
    console.log(`  ⚠ ${r.name}`);
  });
  
  console.log("\nОшибки:");
  results.filter(r => r.status === 'ERROR').forEach(r => {
    console.log(`  ✗ ${r.name}: ${r.error}`);
  });
  
  await playwrightScraper.close();
})();
