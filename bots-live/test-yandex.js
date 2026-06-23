(async()=>{
  const url = `https://yandex.ru/search/?text=${encodeURIComponent("трикотаж новости")}&lr=213`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(10000)
  });
  const html = await resp.text();
  require('fs').writeFileSync('C:\\Users\\va_ku\\OneDrive\\Трикотажный Гуру\\bots-live\\yandex-test.html', html);
  console.log("HTML length:", html.length);
  console.log("First 2000 chars saved to yandex-test.html");
})().catch(e=>console.log('Error:', e.message));
