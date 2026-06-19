import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

const PHONE = "+79222019199";

const PRICE_MAP: Record<string, string> = {
  "палантин":                          "от 3\u00a0000 ₽",
  "шарфы и шапки":                    "от 1\u00a0200 ₽",
  "шарфы":                             "от 2\u00a0000 ₽",
  "шапки":                             "от 1\u00a0200 ₽",
  "пледы":                             "от 2\u00a0500 ₽",
  "кардиганы":                         "от 6\u00a0500 ₽",
  "платья":                            "от 6\u00a0500 ₽",
  "джемпер":                           "от 6\u00a0000 ₽",
  "свитер":                            "от 6\u00a0000 ₽",
  "снуд":                              "от 1\u00a0200 ₽",
  "косынка":                           "от 2\u00a0500 ₽",
  "туники":                            "от 6\u00a0000 ₽",
};

function getCategoryPrice(name: string): string {
  return PRICE_MAP[name.toLowerCase().trim()] ?? "Цена по запросу";
}

interface Category {
  name: string;
  images: string[];
}

export default function ProductPanel() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${BASE}/api/products/categories`)
      .then((r) => r.json())
      .then((data: Category[]) => {
        setCategories(data);
        if (data.length > 0) setSelected(data[0].name);
      })
      .catch(() => {});
  }, [BASE]);

  const current = categories.find((c) => c.name === selected);

  return (
    <div className="flex flex-col h-full bg-stone-50">
      <div className="px-5 pt-4 pb-2 bg-white border-b border-border">
        <h2 className="text-base font-semibold text-stone-700 mb-3">Наши изделия</h2>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 && (
            <span className="text-sm text-muted-foreground">Загрузка категорий…</span>
          )}
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelected(cat.name)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                selected === cat.name
                  ? "bg-stone-800 text-white shadow-sm"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
        {selected && (
          <p className="mt-2 text-sm font-semibold text-stone-700">
            {getCategoryPrice(selected)}
          </p>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        {current && current.images.length > 0 ? (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {current.images.map((src, i) => (
              <div key={i} className="block w-full rounded-xl">
                <img
                  src={src}
                  alt={`${current.name} ${i + 1}`}
                  className="w-full aspect-[3/4] object-cover rounded-xl border border-border shadow-sm"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {categories.length === 0 ? "Загрузка…" : "Фотографии не найдены"}
          </div>
        )}
      </ScrollArea>

      {/* Call designer button */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-white">
        <a
          href={`tel:${PHONE}`}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white font-medium text-sm shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
        >
          📞 Позвонить дизайнеру
        </a>
      </div>
    </div>
  );
}
