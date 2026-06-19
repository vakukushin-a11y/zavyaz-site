export interface ProductPrice {
  category: string;
  price_from: number;
  currency: "RUB";
  display_text: string;
}

export const PRODUCT_PRICES: ProductPrice[] = [
  { category: "Палантины",  price_from: 3000, currency: "RUB", display_text: "Палантины от 3\u00a0000 ₽" },
  { category: "Шарфы",      price_from: 2000, currency: "RUB", display_text: "Шарфы от 2\u00a0000 ₽" },
  { category: "Шапки",      price_from: 1200, currency: "RUB", display_text: "Шапки от 1\u00a0200 ₽" },
  { category: "Пледы",      price_from: 2500, currency: "RUB", display_text: "Пледы от 2\u00a0500 ₽" },
  { category: "Кардиганы",  price_from: 6500, currency: "RUB", display_text: "Кардиганы от 6\u00a0500 ₽" },
  { category: "Платья",     price_from: 6500, currency: "RUB", display_text: "Платья от 6\u00a0500 ₽" },
  { category: "Джемперы",   price_from: 6000, currency: "RUB", display_text: "Джемперы от 6\u00a0000 ₽" },
  { category: "Свитеры",    price_from: 6000, currency: "RUB", display_text: "Свитеры от 6\u00a0000 ₽" },
  { category: "Снуды",      price_from: 1200, currency: "RUB", display_text: "Снуды от 1\u00a0200 ₽" },
  { category: "Косынки",    price_from: 2500, currency: "RUB", display_text: "Косынки от 2\u00a0500 ₽" },
  { category: "Туники",     price_from: 6000, currency: "RUB", display_text: "Туники от 6\u00a0000 ₽" },
];

export const DEFAULT_PRICE_TEXT = "Цена по запросу";

const PRICE_MAP = new Map<string, string>([
  ...PRODUCT_PRICES.map((p): [string, string] => [p.category.toLowerCase(), p.display_text]),
  ["шарфы и шапки", `Шарфы от 2\u00a0000 ₽, шапки от 1\u00a0200 ₽`],
]);

export function getPriceDisplay(category: string): string {
  return PRICE_MAP.get(category.toLowerCase().trim()) ?? DEFAULT_PRICE_TEXT;
}

export function pricesForPrompt(): string {
  const lines = PRODUCT_PRICES.map((p) => `- ${p.display_text}`);
  lines.push(`- Шарфы и шапки: шарфы от 2\u00a0000 ₽, шапки от 1\u00a0200 ₽`);
  lines.push(`- Брюки, кофты и другая одежда: ${DEFAULT_PRICE_TEXT}`);
  return lines.join("\n");
}
