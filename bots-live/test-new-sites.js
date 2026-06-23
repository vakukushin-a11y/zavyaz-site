const sites = [
  { name: "Ramonki.ru", url: "https://ramonki.ru/" },
  { name: "Star-tex.ru", url: "https://star-tex.ru/" },
  { name: "Star-tex.ru blog", url: "https://star-tex.ru/blog/" },
  { name: "Zolotoy.ru", url: "https://zolotoy.ru/" },
  { name: "Grazia.ru", url: "https://grazia.ru/" },
  { name: "Dzen.ru", url: "https://dzen.ru/" },
  { name: "TheSymbol.ru", url: "https://thesymbol.ru/" },
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
      let text = match[1].replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
      if (text.length > 100 && !text.includes("window.") && !text.includes("function") && !text.includes("cookie")) {
        paragraphs.push(text);
      }
    }
    const fullText = paragraphs.join("\n\n");
    if (title && fullText.length > 200) return { title, text: fullText };
    return null;
  } catch(e) { return null; }
}

(async () => {
  for (const s of sites) {
    try {
      console.log(`\n=== ${s.name} (${s.url}) ===`);
      const resp = await fetch(s.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow"
      });
      const html = await resp.text();
      console.log(`Status: ${resp.status}, Length: ${html.length}`);
      
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
      
      let knitCount = 0;
      for (const article of articleLinks.slice(0, 3)) {
        const full = await scrapeArticlePage(article.link);
        if (full) {
          const hasKw = KNITWEAR_KEYWORDS.some(kw => (full.title + " " + full.text).toLowerCase().includes(kw));
          console.log(`  ${hasKw ? "✓" : "✗"} ${full.title.substring(0, 60)} [${full.text.length} симв.]`);
          if (hasKw) knitCount++;
        }
      }
      console.log(`Трикотажных: ${knitCount}`);
    } catch(e) {
      console.log(`ОШИБКА: ${e.message}`);
    }
  }
})();
