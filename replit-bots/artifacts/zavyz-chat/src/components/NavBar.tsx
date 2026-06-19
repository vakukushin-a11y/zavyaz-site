import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NavBar() {
  const [location, navigate] = useLocation();
  const [stack, setStack] = useState<string[]>([]);
  const [idx, setIdx] = useState(-1);
  const skipNext = useRef(false);

  // Track location changes into our own stack
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    setStack((prev) => {
      const trimmed = prev.slice(0, idx + 1);
      if (trimmed[trimmed.length - 1] === location) return prev;
      return [...trimmed, location];
    });
    setIdx((prev) => prev + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const canBack = idx > 0;
  const canForward = idx < stack.length - 1;

  const goBack = () => {
    if (!canBack) return;
    skipNext.current = true;
    const newIdx = idx - 1;
    setIdx(newIdx);
    navigate(stack[newIdx]);
  };

  const goForward = () => {
    if (!canForward) return;
    skipNext.current = true;
    const newIdx = idx + 1;
    setIdx(newIdx);
    navigate(stack[newIdx]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex gap-2 bg-white/80 backdrop-blur-sm shadow-lg rounded-full px-3 py-2 border border-border">
      <Button
        variant="ghost"
        size="sm"
        onClick={goBack}
        disabled={!canBack}
        className="text-muted-foreground hover:text-foreground rounded-full px-3 disabled:opacity-40"
        title="Назад"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="text-sm">Назад</span>
      </Button>
      <div className="w-px bg-border self-stretch" />
      <Button
        variant="ghost"
        size="sm"
        onClick={goForward}
        disabled={!canForward}
        className="text-muted-foreground hover:text-foreground rounded-full px-3 disabled:opacity-40"
        title="Вперёд"
      >
        <span className="text-sm">Вперёд</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
