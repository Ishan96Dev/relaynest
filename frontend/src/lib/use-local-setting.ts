"use client";

import * as React from "react";

/** Device-local preference storage. Honest about scope: not synced across devices or accounts. */
export function useLocalSetting<T extends object>(key: string, initial: T) {
  const initialRef = React.useRef(initial);
  const [value, setValue] = React.useState<T>(initial);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`rn:${key}`);
      if (raw) setValue({ ...initialRef.current, ...JSON.parse(raw) });
    } catch { /* ignore corrupt value */ }
    setLoaded(true);
  }, [key]);
  const save = (v: T) => { localStorage.setItem(`rn:${key}`, JSON.stringify(v)); };
  return { value, setValue, save, loaded, defaults: initialRef.current };
}