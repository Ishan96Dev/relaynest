"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Headline that reveals word by word (blur and rise) when it scrolls into view, and again on every page
 * load or refresh. With `rainbow`, each word gets the animated purple-to-rainbow gradient.
 */
export function SplitText({
  text,
  rainbow,
  delay = 0,
  as: Tag = "span",
  className,
}: {
  text: string;
  rainbow?: boolean;
  delay?: number;
  as?: React.ElementType;
  className?: string;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return setShown(true);
    const io = new IntersectionObserver(
      ([e]) => { if (e?.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const words = text.split(" ");
  return (
    <Tag ref={ref} aria-label={text} style={{ "--base": `${delay}ms` } as React.CSSProperties} className={cn("split", shown && "in", className)}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span aria-hidden className={cn("word", rainbow && "rw")} style={{ "--i": i } as React.CSSProperties}>{w}</span>
          {i < words.length - 1 && " "}
        </React.Fragment>
      ))}
    </Tag>
  );
}
/** Page title: words reveal in turn and the last word gets the rainbow gradient. */
export function PageTitle({ text }: { text: string }) {
  const words = text.split(" ");
  const last = words.pop() ?? text;
  return (
    <>
      {words.length > 0 && <><SplitText text={words.join(" ")} /> </>}
      <SplitText text={last} rainbow delay={words.length ? 160 : 0} />
    </>
  );
}