import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Send, Settings2, CheckCircle2, ExternalLink } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AiNewsItem {
  title: string;
  url: string;
  summary: string;
  imageUrl: string | null;
  sourceName: string;
  lang: string;
  publishedAt: string | null;
}

interface VkSettings {
  token: string;
  groupId: string;
  appId: string;
}

type LangFilter = "all" | "ru" | "en";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function buildPostText(item: AiNewsItem): string {
  const parts: string[] = [];
  parts.push(`📰 ${item.title}`);
  if (item.summary) parts.push(`\n${item.summary}`);
  parts.push(`\n🔗 ${item.url}`);
  parts.push(`\n#ИИ #AI #технологии`);
  return parts.join("\n");
}

function NewsCard({
  item,
  onPublish,
}: {
  item: AiNewsItem;
  onPublish: (item: AiNewsItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const date = item.publishedAt ? formatDate(item.publishedAt) : "";
  const header = [item.sourceName, date].filter(Boolean).join(" • ");

  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      {item.imageUrl && !imgError && (
        <div className="w-full h-40 overflow-hidden shrink-0">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <div className="flex flex-col gap-2 px-4 pb-4">
        <p className="text-xs text-muted-foreground">{header}</p>
        <h3 className="font-semibold text-stone-800 leading-snug line-clamp-3">{item.title}</h3>
        {item.summary && (
          <p className="text-sm text-stone-600 line-clamp-3 leading-relaxed">{item.summary}</p>
        )}
        <div className="flex gap-2 mt-1">
          <Button
            size="sm"
            onClick={() => onPublish(item)}
            className="flex-1 bg-[#0077FF] hover:bg-[#0060CC] text-white border-0 rounded-full text-xs gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            Опубликовать
          </Button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border text-xs text-stone-500 hover:bg-stone-50 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Открыть
          </a>
        </div>
      </div>
    </div>
  );
}

export default function VkPage() {
  const queryClient = useQueryClient();
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [groupIdInput, setGroupIdInput] = useState("");
  const [appIdInput, setAppIdInput] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [publishModal, setPublishModal] = useState<AiNewsItem | null>(null);
  const [postText, setPostText] = useState("");
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: settings } = useQuery<VkSettings>({
    queryKey: ["vk-settings"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/vk/settings`);
      return r.json();
    },
  });

  const { data: newsData, isLoading, refetch, isRefetching } = useQuery<{ items: AiNewsItem[] }>({
    queryKey: ["vk-ai-news", langFilter],
    queryFn: async ({ signal }) => {
      const r = await fetch(`${BASE}/api/vk/ai-news?lang=${langFilter}&limit=40`, { signal });
      if (!r.ok) throw new Error("Ошибка загрузки");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    gcTime: 10 * 60 * 1000,
  });

  const saveSettings = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/vk/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput, groupId: groupIdInput, appId: appIdInput }),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vk-settings"] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    },
  });

  const publishPost = useMutation({
    mutationFn: async (message: string) => {
      const r = await fetch(`${BASE}/api/vk/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      return r.json() as Promise<{ ok?: boolean; error?: string; postId?: number }>;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setPublishResult({ ok: true, message: `✅ Пост опубликован${data.postId ? ` (ID ${data.postId})` : ""}` });
      } else {
        setPublishResult({ ok: false, message: `❌ ${data.error ?? "Ошибка публикации"}` });
      }
    },
  });

  const openPublishModal = (item: AiNewsItem) => {
    setPublishModal(item);
    setPostText(buildPostText(item));
    setPublishResult(null);
  };

  const handlePublish = () => {
    if (!postText.trim()) return;
    publishPost.mutate(postText);
  };

  const hasVkConfig = settings?.token && settings?.groupId;
  const loading = isLoading || isRefetching;

  return (
    <div className="min-h-screen bg-stone-50 text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-border shadow-sm px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#0077FF] flex items-center justify-center">
              <span className="text-white font-bold text-xs">VK</span>
            </div>
            <h1 className="text-lg font-semibold text-stone-800">Публикации ВКонтакте</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={loading}
            className="gap-1.5 text-stone-500"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
          <Button
            variant={settingsOpen ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSettingsOpen((v) => !v);
              if (!settingsOpen && settings) {
                setTokenInput(settings.token ?? "");
                setGroupIdInput(settings.groupId ?? "");
                setAppIdInput(settings.appId ?? "");
              }
            }}
            className="gap-1.5"
          >
            <Settings2 className="h-4 w-4" />
            Настройки ВК
          </Button>
        </div>
      </header>

      {/* Settings panel */}
      {settingsOpen && (
        <div className="mx-auto max-w-2xl mt-4 px-4">
          <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
            <h2 className="font-semibold text-stone-700 mb-3">Авторизация ВКонтакте</h2>

            {/* Step 1: create app */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-800 mb-4 space-y-1.5">
              <p className="font-semibold">Шаг 1 — создайте и настройте Standalone-приложение</p>
              <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                <li>Откройте <a href="https://vk.com/editapp?act=create" target="_blank" rel="noopener noreferrer" className="underline font-medium">vk.com/editapp?act=create</a></li>
                <li>Выберите тип <strong>Standalone-приложение</strong>, введите любое название, нажмите «Подключить»</li>
                <li>На странице приложения перейдите в раздел <strong>Настройки</strong></li>
                <li>В разделе <strong>«Права доступа»</strong> (Scopes / Permissions) включите <strong>wall</strong></li>
                <li>Сохраните и скопируйте <strong>ID приложения</strong> (вверху страницы)</li>
              </ol>
            </div>

            <div className="flex flex-col gap-3">
              {/* App ID */}
              <div>
                <label className="text-sm font-medium text-stone-700 block mb-1">
                  ID приложения (Standalone)
                </label>
                <Input
                  type="text"
                  placeholder="1234567"
                  value={appIdInput}
                  onChange={(e) => setAppIdInput(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>

              {/* Step 2: get token */}
              {appIdInput && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-800 space-y-1.5">
                  <p className="font-semibold">Шаг 2 — получите пользовательский токен</p>
                  <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                    <li>Нажмите ссылку ниже (войдите как администратор сообщества)</li>
                    <li>Разрешите доступ</li>
                    <li>В адресной строке найдите <code className="bg-blue-100 px-1 rounded">access_token=…</code> и скопируйте значение до <code className="bg-blue-100 px-1 rounded">&amp;</code></li>
                  </ol>
                  <a
                    href={`https://oauth.vk.com/authorize?client_id=${appIdInput}&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=8192&response_type=token`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 underline text-blue-700 hover:text-blue-900 font-medium"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Получить токен (откроется VK OAuth)
                  </a>
                </div>
              )}

              {/* Token */}
              <div>
                <label className="text-sm font-medium text-stone-700 block mb-1">
                  Пользовательский токен
                </label>
                <Input
                  type="password"
                  placeholder="vk1.a.XXXXXXXX..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              {/* Group ID */}
              <div>
                <label className="text-sm font-medium text-stone-700 block mb-1">
                  ID сообщества (без минуса)
                </label>
                <Input
                  type="text"
                  placeholder="123456789"
                  value={groupIdInput}
                  onChange={(e) => setGroupIdInput(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>

              <Button
                onClick={() => saveSettings.mutate()}
                disabled={saveSettings.isPending || !tokenInput || !groupIdInput}
                className="w-full gap-2 bg-[#0077FF] hover:bg-[#0060CC] text-white border-0"
              >
                {settingsSaved ? (
                  <><CheckCircle2 className="h-4 w-4" />Сохранено!</>
                ) : saveSettings.isPending ? (
                  "Сохранение…"
                ) : (
                  "Сохранить настройки"
                )}
              </Button>
            </div>

            {!hasVkConfig && (
              <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ⚠️ Токен и ID сообщества не настроены. Публикация будет недоступна до их сохранения.
              </p>
            )}
            {hasVkConfig && (
              <p className="mt-3 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                ✅ Авторизация настроена. Публикация доступна.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lang filter */}
      <div className="mx-auto max-w-5xl px-4 mt-4">
        <div className="flex gap-2 mb-4">
          {(["all", "ru", "en"] as LangFilter[]).map((l) => (
            <button
              key={l}
              onClick={() => setLangFilter(l)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                langFilter === l
                  ? "bg-stone-800 text-white shadow-sm"
                  : "bg-white border border-border text-stone-600 hover:bg-stone-50"
              }`}
            >
              {l === "all" ? "Все" : l === "ru" ? "Русские" : "Английские"}
            </button>
          ))}
        </div>

        {/* News grid */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-border h-64 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && (!newsData?.items || newsData.items.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <p>Новости не загружены. Нажмите «Обновить».</p>
          </div>
        )}

        {!loading && newsData?.items && newsData.items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {newsData.items.map((item, idx) => (
              <NewsCard key={`${item.url}-${idx}`} item={item} onPublish={openPublishModal} />
            ))}
          </div>
        )}
      </div>

      {/* Publish modal */}
      {publishModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-4 p-6">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-stone-800">Публикация в ВКонтакте</h2>
              <button
                onClick={() => { setPublishModal(null); setPublishResult(null); }}
                className="text-muted-foreground hover:text-stone-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700 block mb-1">Текст поста</label>
              <Textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                rows={9}
                className="text-sm resize-none font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">{postText.length} символов</p>
            </div>

            {publishResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${publishResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {publishResult.message}
              </div>
            )}

            {!hasVkConfig && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ⚠️ Настройте токен и ID сообщества перед публикацией.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handlePublish}
                disabled={publishPost.isPending || !postText.trim() || !hasVkConfig || !!publishResult?.ok}
                className="flex-1 bg-[#0077FF] hover:bg-[#0060CC] text-white border-0 gap-2"
              >
                {publishPost.isPending ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" />Публикация…</>
                ) : publishResult?.ok ? (
                  <><CheckCircle2 className="h-4 w-4" />Опубликовано!</>
                ) : (
                  <><Send className="h-4 w-4" />Опубликовать</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setPublishModal(null); setPublishResult(null); }}
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
