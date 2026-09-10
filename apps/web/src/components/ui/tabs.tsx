"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({ items, defaultId }: { items: TabItem[]; defaultId?: string }) {
  const baseId = useId();
  const [active, setActive] = useState(defaultId ?? items[0]?.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = Math.max(
    0,
    items.findIndex((t) => t.id === active)
  );

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = items.length - 1;
    if (next !== null) {
      e.preventDefault();
      setActive(items[next].id);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Tabs" className="flex gap-1 overflow-x-auto border-b border-border">
        {items.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors duration-fast",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {items.map((t) =>
        t.id === active ? (
          <div
            key={t.id}
            role="tabpanel"
            id={`${baseId}-panel-${t.id}`}
            aria-labelledby={`${baseId}-tab-${t.id}`}
            tabIndex={0}
            className="pt-4"
          >
            {items[activeIndex]?.content}
          </div>
        ) : null
      )}
    </div>
  );
}
