(async () => {
  console.log("Тестируем загрузку новостей...\n");
  
  const loginRes = await fetch("http://localhost:3000/api/cms/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "zavyz2026" })
  });
  const loginData = await loginRes.json();
  console.log("Логин:", loginData.ok ? "OK" : "FAIL");
  
  const cookie = loginRes.headers.get("set-cookie");
  
  console.log("\nЗагружаю новости (может занять 30-60 сек)...");
  const fetchRes = await fetch("http://localhost:3000/api/cms/incoming/fetch", {
    method: "POST",
    headers: { "Cookie": cookie }
  });
  const fetchData = await fetchRes.json();
  console.log("Результат:", fetchData);
  
  const newsRes = await fetch("http://localhost:3000/api/cms/incoming", {
    headers: { "Cookie": cookie }
  });
  const news = await newsRes.json();
  console.log(`\nЗагружено: ${news.length} новостей`);
  
  // Группируем по источникам
  const bySource = {};
  news.forEach(n => {
    if (!bySource[n.source]) bySource[n.source] = 0;
    bySource[n.source]++;
  });
  
  console.log("\nПо источникам:");
  Object.entries(bySource).forEach(([source, count]) => {
    console.log(`  ${source}: ${count} новостей`);
  });
  
  console.log("\nПримеры новостей:");
  news.slice(0, 5).forEach((n, i) => console.log(`  ${i+1}. ${n.title?.slice(0, 60)} [${n.source}]`));
})();
