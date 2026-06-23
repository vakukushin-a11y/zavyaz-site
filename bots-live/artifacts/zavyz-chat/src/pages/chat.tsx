import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useCreateAnthropicConversation,
  useListAnthropicMessages,
  getListAnthropicMessagesQueryKey,
  getListLeadsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";
import ProductPanel from "@/components/ProductPanel";

const LOGO = `${import.meta.env.BASE_URL}welcome/logo.png`;

export default function ChatPage() {
  const [, setLocation] = useLocation();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastImages, setLastImages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const createConversation = useCreateAnthropicConversation();

  useEffect(() => {
    if (!conversationId && !createConversation.isPending && !createConversation.isSuccess) {
      createConversation.mutate(
        { data: { title: "Новый разговор" } },
        {
          onSuccess: (data: { id: number }) => {
            setConversationId(data.id);
          },
        }
      );
    }
  }, [conversationId, createConversation.isPending, createConversation.isSuccess, createConversation.mutate]);

  const { data: messages = [], isLoading: isLoadingMessages } = useListAnthropicMessages(conversationId!, {
    query: {
      enabled: !!conversationId,
      queryKey: getListAnthropicMessagesQueryKey(conversationId!),
    },
  });

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, isStreaming]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !conversationId || isStreaming) return;

    const userMessage = input;
    setInput("");
    setIsStreaming(true);
    setStreamingMessage("");
    setLastImages([]);

    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/anthropic/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage }),
      });

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.done) {
                if (json.images && json.images.length > 0) {
                  setLastImages(json.images);
                }
              } else if (json.content) {
                setStreamingMessage((prev) => prev + json.content);
              }
            } catch {
              // ignore incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
    } finally {
      setIsStreaming(false);
      setStreamingMessage("");
      queryClient.invalidateQueries({ queryKey: getListAnthropicMessagesQueryKey(conversationId) });
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    }
  };

  return (
    <div className="flex flex-row h-screen bg-background text-foreground">
      <div className="w-1/3 flex flex-col h-full border-r border-border min-w-0">
        <header className="flex flex-col gap-3 px-6 py-4 border-b border-border bg-card shadow-sm z-10">
          <div>
            <h1 className="text-xl font-serif font-bold text-primary">Завязь</h1>
            <p className="text-sm text-muted-foreground">Ваш консультант по вязанию</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setLocation("/news")}
              className="flex-1 bg-gradient-to-r from-stone-600 to-stone-800 hover:from-stone-700 hover:to-stone-900 text-white border-0 py-5 text-sm rounded-full tracking-wide shadow-md transition-all duration-300 hover:shadow-lg hover:scale-105"
            >
              📰 Новости
            </Button>
            <Button
              onClick={() => setLocation("/knowledge")}
              variant="outline"
              className="flex-1 border-stone-300 text-stone-700 hover:bg-stone-100 py-5 text-sm rounded-full tracking-wide transition-all duration-300"
            >
              📚 Энциклопедия
            </Button>
          </div>
        </header>

        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div className="space-y-4">
            {!conversationId || isLoadingMessages ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-3/4 bg-primary/10 rounded-2xl rounded-tl-sm" />
                <Skeleton className="h-16 w-3/4 ml-auto bg-muted rounded-2xl rounded-tr-sm" />
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {messages.length === 0 && !isStreaming && (
                  <div className="flex items-end gap-2 justify-start">
                    <img src={LOGO} alt="Завязь" className="w-7 h-7 rounded-full object-contain shrink-0 border border-border shadow-sm bg-white" />
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-5 py-3 bg-card border border-border text-card-foreground shadow-sm">
                      <div className="whitespace-pre-wrap leading-relaxed text-base">
                        Добрый день! Я консультант магазина Завязь — помогаю подобрать вязаные изделия на заказ. Вяжем палантины, шарфы, шапки, снуды, пледы, кардиганы, джемперы, платья, туники. Всё индивидуально — ваш цвет, узор и размер. Что вас интересует?
                      </div>
                    </div>
                  </div>
                )}

                {(messages as { id: number; role: string; content: string }[]).map((msg, idx: number) => (
                  <div key={msg.id} className="flex flex-col gap-2">
                    <div className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <img src={LOGO} alt="Завязь" className="w-7 h-7 rounded-full object-contain shrink-0 border border-border shadow-sm bg-white" />
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-card border border-border text-card-foreground rounded-tl-sm shadow-sm"
                        }`}
                      >
                        <div className="whitespace-pre-wrap leading-relaxed text-base">{msg.content}</div>
                      </div>
                    </div>
                    {msg.role === "assistant" && idx === messages.length - 1 && lastImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-1 pl-9">
                        {lastImages.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`Изделие ${i + 1}`}
                            className="h-36 w-28 object-cover rounded-xl border border-border shadow-sm"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex items-end gap-2 justify-start">
                    <img src={LOGO} alt="Завязь" className="w-7 h-7 rounded-full object-contain shrink-0 border border-border shadow-sm bg-white" />
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-5 py-3 bg-card border border-border text-card-foreground shadow-sm">
                      {streamingMessage ? (
                        <div className="whitespace-pre-wrap leading-relaxed text-base">{streamingMessage}</div>
                      ) : (
                        <div className="flex space-x-1.5 items-center h-6">
                          <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" />
                          <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                          <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </ScrollArea>

      </div>

      <div className="w-2/3 h-full overflow-hidden">
        <ProductPanel />
      </div>
    </div>
  );
}
