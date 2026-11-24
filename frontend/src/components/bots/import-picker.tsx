"use client";
import { FileUp, Sparkles } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/input";
import type { ImportResult } from "@/lib/agent-templates";

export interface PickerTemplate { id: string; name: string; tagline: string; category: string }

/**
 * Modal with two ways to auto-fill a form: pick a ready-made template, or import a JSON file / pasted JSON.
 * The caller decides what each choice fills in.
 */
export function ImportPicker<T>({ open, onClose, title, templates, onPickTemplate, parse, example, onImport, fields }: {
  open: boolean; onClose: () => void; title: string; templates: PickerTemplate[]; onPickTemplate: (id: string) => void;
  parse: (text: string) => ImportResult<T>; example: string; onImport: (value: T) => void; fields: string;
}) {
  const [tab, setTab] = React.useState("templates");
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string>();
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setTab("templates"); setError(undefined); } }, [open]);

  function apply(source: string) {
    if (!source.trim()) return setError("Paste JSON or choose a file first.");
    const r = parse(source);
    if (!r.ok) return setError(r.message);
    setError(undefined); setText(""); onImport(r.value); onClose();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 200_000) return setError("That file is too large. Use a JSON file under 200 KB.");
    setText(await file.text()); setError(undefined);
  }

  return (
    <Modal open={open} onClose={onClose} title={title} icon={<Sparkles className="mt-1 size-5 text-lavender" aria-hidden />} className="max-w-2xl">
      <Tabs size="sm" label="Auto-fill method" value={tab} onChange={setTab} tabs={[{ id: "templates", label: "Templates" }, { id: "import", label: "Import JSON" }]} />
      {tab === "templates" ? (
        <ul className="mt-4 grid max-h-[55vh] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => { onPickTemplate(t.id); onClose(); }}
                className="flex h-full w-full flex-col gap-1 rounded-xl border border-border bg-surface-2/60 p-3 text-left transition hover:border-lavender/60 hover:bg-primary/10">
                <span className="text-sm font-bold text-foreground">{t.name}</span>
                <span className="text-xs text-muted">{t.tagline}</span>
                <span className="mt-1 w-fit rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-lavender">{t.category}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted">Upload a .json file or paste it below. Supported fields: {fields}. Anything you leave out stays as it is.</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={onFile} aria-label="JSON file" tabIndex={-1} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileUp className="size-4" aria-hidden />Choose file</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setText(example); setError(undefined); }}>Insert example</Button>
          </div>
          <Textarea aria-label="Import JSON" rows={9} spellCheck={false} className="font-mono text-xs" value={text} aria-invalid={Boolean(error)}
            onChange={(e) => { setText(e.target.value); setError(undefined); }} placeholder={example} />
          {error && <p role="alert" className="text-xs font-medium text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={() => apply(text)}>Import &amp; fill</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
