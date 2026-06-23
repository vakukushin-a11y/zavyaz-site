const sites = [
  { name: "Star-tex.ru news", url: "https://star-tex.ru/news/" },
  { name: "Star-tex.ru articles", url: "https://star-tex.ru/articles/" },
  { name: "Grazia.ru fashion", url: "https://grazia.ru/fashion/" },
  { name: "Grazia.ru trends", url: "https://grazia.ru/trends/" },
  { name: "Dzen.ru search", url: "https://dzen.ru/search?text=трикотаж" },
];

(async () => {
  for (const s of sites) {
    try {
      console.log(`\n=== ${s.name} ===`);
      const resp = await fetch(s.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow"
      });
      const html = await resp.text();
      console.log(`Status: ${resp.status}, Length: ${html.length}`);
      
      // Находим ссылки на статьи
      const sourceDomain = new URL(s.url).hostname;
      const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
      const articleLinks = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        let title = match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
      console.log(`Найдено ссылок: ${articleLinks.length}`);
      articleLinks.slice(0, 3).forEach(a => console.log(`  - ${a.title.substring(0, 60)}`));
    } catch(e) {
      console.log(`ОШИБКА: ${e.message}`);
    }
  }
})();
