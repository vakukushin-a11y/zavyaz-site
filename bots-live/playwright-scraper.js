const { chromium } = require('playwright');

class PlaywrightScraper {
  constructor() {
    this.browser = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrapePage(url) {
    await this.init();
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      // Ждем загрузки контента
      await page.waitForTimeout(3000);
      
      // Извлекаем заголовок
      const title = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        return h1 ? h1.textContent.trim() : document.title;
      });
      
      // Извлекаем все параграфы
      const paragraphs = await page.evaluate(() => {
        const paras = Array.from(document.querySelectorAll('p, article, .article-content, .content, .post-content'));
        return paras
          .map(p => p.textContent.trim())
          .filter(text => text.length > 100)
          .filter(text => !text.includes('cookie'))
          .filter(text => !text.includes('JavaScript'))
          .filter(text => !text.includes('Политика конфиденциальности'))
          .join('\n\n');
      });
      
      // Извлекаем ссылки на статьи
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(a => ({
            href: a.href,
            text: a.textContent.trim()
          }))
          .filter(link => link.text.length >= 20 && link.text.length < 300)
          .filter(link => link.href.startsWith('http'))
          .slice(0, 20);
      });
      
      await context.close();
      
      return {
        title,
        text: paragraphs,
        links,
        url
      };
    } catch (error) {
      console.error(`Ошибка при скрейпинге ${url}:`, error.message);
      await context.close();
      return null;
    }
  }

  async scrapeArticleList(url) {
    await this.init();
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      await page.waitForTimeout(3000);
      
      // Извлекаем ссылки на статьи
      const articles = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors
          .map(a => ({
            href: a.href,
            title: a.textContent.trim()
          }))
          .filter(link => link.title.length >= 20 && link.title.length < 300)
          .filter(link => link.href.startsWith('http'))
          .filter(link => !link.href.includes('/tag/') && !link.href.includes('/category/'))
          .slice(0, 15);
      });
      
      await context.close();
      return articles;
    } catch (error) {
      console.error(`Ошибка при получении списка статей ${url}:`, error.message);
      await context.close();
      return [];
    }
  }
}

module.exports = new PlaywrightScraper();
