import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Newspaper } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface NewsItem {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  sourceName: string;
  sourceType: string;
  imageUrl: string | null;
  aiAnalysis: string | null;
  relevanceScore: number;
  publishedAt: string | null;
  createdAt: string;
}

interface NewsResponse {
  items: NewsItem[];
  total: number;
  lastRefreshedAt: string | null;
}

type FilterType = "all" | "ru" | "int";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин. назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч. назад`;
  const days = Math.floor(hrs / 24);
  return `${days} д. назад`;
}

function NewsCard({ item }: { item: NewsItem }) {
  const [imgError, setImgError] = useState(false);

  const date = formatDate(item.publishedAt);
  const source = item.sourceName || "";
  const header = [date, source].filter(Boolean).join(" • ");

  const analysisText = item.aiAnalysis ?? item.summary ?? "";
  const paragraphs = analysisText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">

      {/* Image */}
      {item.imageUrl && !imgError && (
        <div className="w-full aspect-[16/7] overflow-hidden bg-stone-100">
          <img
            src={item.imageUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <div className="p-5 flex flex-col gap-3">

        {/* Date + source */}
        {header && (
          <p className="text-xs font-medium text-stone-400 tracking-wide uppercase">
            📅 {header}
          </p>
        )}

        {/* Title */}
        <h2 className="text-lg font-semibold text-stone-800 leading-snug">
          {item.title}
        </h2>

        {/* AI analysis paragraphs */}
        {paragraphs.length > 0 && (
          <div className="flex flex-col gap-2">
            {paragraphs.map((para, i) => (
              <p key={i} className="text-sm text-stone-600 leading-relaxed">
                {para}
              </p>
            ))}
          </div>
        )}

      </div>
    </article>
  );
}

export default function NewsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery<NewsResponse>({
    queryKey: ["news", filter],
    queryFn: async () => {
      const res = await fetch(`${BASE}api/news?type=${filter}&limit=60`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json() as Promise<NewsResponse>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}api/news/refresh`, { method: "POST" });
      if (!res.ok) throw new Error("Ошибка обновления");
      return res.json() as Promise<{ added: number; message: string }>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["news"] });
    },
  });

  const tabs: { key: FilterType; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "ru", label: "🇷🇺 Российские" },
    { key: "int", label: "🌍 Международные" },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div
        className="bg-gradient-to-br from-stone-800 via-stone-700 to-purple-900 text-white px-6 py-10"
        style={{ paddingTop: "env(safe-area-inset-top, 1rem)" }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                📰 Новости трикотажной индустрии
              </h1>
              <p className="mt-1 text-stone-300 text-sm">
                Российские и международные источники · ИИ-анализ · последние 7 дней
              </p>
              {data?.lastRefreshedAt && (
                <p className="mt-1 text-stone-400 text-xs">
                  Обновлено {formatRelative(data.lastRefreshedAt)}
                </p>
              )}
            </div>
            <Button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending || isFetching}
              className="shrink-0 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full px-4 py-2 text-sm font-medium transition-all"
              size="sm"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refresh.isPending ? "animate-spin" : ""}`}
              />
              {refresh.isPending ? "Загружаем..." : "Обновить"}
            </Button>
          </div>

          {refresh.isSuccess && (
            <div className="mt-3 text-sm text-emerald-300">
              ✓ {refresh.data?.message}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 mt-6 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  filter === t.key
                    ? "bg-white text-stone-800"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {t.label}
                {t.key === "all" && data?.total != null && (
                  <span className="ml-1.5 text-xs opacity-60">{data.total}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* News list */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex flex-col gap-6">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl overflow-hidden border border-stone-100 animate-pulse"
              >
                <div className="w-full aspect-[16/7] bg-stone-100" />
                <div className="p-5 flex flex-col gap-3">
                  <div className="h-3 w-32 bg-stone-100 rounded" />
                  <div className="h-5 w-3/4 bg-stone-200 rounded" />
                  <div className="h-3 w-full bg-stone-100 rounded" />
                  <div className="h-3 w-5/6 bg-stone-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Newspaper className="h-16 w-16 text-stone-200 mb-4" />
            <p className="text-stone-500 font-medium mb-1">Новостей пока нет</p>
            <p className="text-stone-400 text-sm mb-6">
              Нажмите «Обновить» чтобы загрузить свежие материалы
            </p>
            <Button
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white rounded-full px-6"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refresh.isPending ? "animate-spin" : ""}`} />
              Загрузить новости
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {data.items.map((item) => (
              <NewsCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
