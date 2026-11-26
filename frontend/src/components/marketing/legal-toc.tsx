"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { centerElementInContainer, useScrollSpy } from "@/components/ui/use-scroll-spy";
import { cn } from "@/lib/utils";

export function LegalSidebarToc({
  pageTitle,
  sections,
}: {
  pageTitle: string;
  sections: Array<{ id: string; title: string }>;
}) {
  const ids = React.useMemo(() => sections.map((s) => s.id), [sections]);
  const [activeId, setActiveId] = useScrollSpy(ids, { topOffset: 240 });
  const cardRef = React.useRef<HTMLDivElement>(null);
  const linkRefs = React.useRef<Record<string, HTMLAnchorElement | null>>({});

  const activeSection = React.useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0],
    [sections, activeId],
  );

  React.useEffect(() => {
    if (!activeSection) return;
    document.title = `${activeSection.title} · ${pageTitle} | RelayNest`;
    centerElementInContainer(cardRef.current, linkRefs.current[activeSection.id] ?? null);
  }, [activeSection, pageTitle]);

  return (
    <Card ref={cardRef} className="max-h-[calc(100vh-14rem)] overflow-y-auto p-4">
      <div className="sr-only" role="status" aria-live="polite">
        Reading section: {activeSection?.title}
      </div>
      <p className="px-2 pb-2 text-xs font-bold uppercase tracking-[0.08em] text-lavender">On This Page</p>
      <nav aria-label="Page sections">
        <ul className="space-y-1 text-sm">
          {sections.map((s, idx) => {
            const active = activeId === s.id;
            return (
              <li key={s.id}>
                <a
                  ref={(node) => { linkRefs.current[s.id] = node; }}
                  href={`#${s.id}`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    "block rounded-lg border-l-2 px-2.5 py-1.5 transition",
                    active
                      ? "border-lavender bg-primary/20 font-semibold text-lavender"
                      : "border-transparent text-foreground/80 hover:bg-primary/10 hover:text-lavender",
                  )}
                >
                  {idx + 1}. {s.title}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </Card>
  );
}
