"use client";

import { CheckCircle2, Send, Star } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function ContactFeedbackForm({
  kind,
  categories,
  submitLabel,
  placeholderSubject,
  placeholderMessage,
}: {
  kind: "contact" | "feedback";
  categories: string[];
  submitLabel: string;
  placeholderSubject: string;
  placeholderMessage: string;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [category, setCategory] = React.useState(categories[0] ?? "General");
  const [rating, setRating] = React.useState<number>(5);
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          name,
          email,
          category,
          ...(kind === "feedback" ? { rating } : {}),
          subject,
          message,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.details?.[0]?.message ?? json?.error?.message ?? "Please review the fields and try again.");
        return;
      }
      setSent(true);
      toast.success(kind === "feedback" ? "Feedback submitted — thank you!" : "Message sent — we'll get back shortly!");
      setSubject("");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      {sent ? (
        <div className="space-y-4 py-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-400/40 bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="size-7" />
          </div>
          <h3 className="text-2xl font-extrabold">
            {kind === "feedback" ? "Thank you for your feedback!" : "Message received!"}
          </h3>
          <p className="mx-auto max-w-md text-sm text-foreground/80">
            We logged your {kind} submission cleanly. Need urgent help? Email{" "}
            <a href="mailto:ishanrock1234@gmail.com" className="font-semibold text-lavender underline">
              ishanrock1234@gmail.com
            </a>{" "}
            or call <span className="font-semibold">+91 7021133070</span>.
          </p>
          <Button variant="outline" onClick={() => setSent(false)}>
            Send Another {kind === "feedback" ? "Review" : "Message"}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your Name" htmlFor={`${kind}-name`}>
              <Input id={`${kind}-name`} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ishan Chakraborty" />
            </Field>
            <Field label="Email Address" htmlFor={`${kind}-email`}>
              <Input id={`${kind}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Topic" htmlFor={`${kind}-topic`}>
              <Select id={`${kind}-topic`} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            {kind === "feedback" && (
              <div>
                <p className="mb-1.5 text-sm font-semibold">Experience Rating</p>
                <div className="flex h-10 items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-label={`Rate ${n} stars`}
                      className="rounded-lg p-1.5 transition hover:scale-110"
                    >
                      <Star className={`size-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-muted">{rating} / 5</span>
                </div>
              </div>
            )}
          </div>

          <Field label="Subject" htmlFor={`${kind}-subject`}>
            <Input id={`${kind}-subject`} required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={placeholderSubject} />
          </Field>

          <Field label="Message" htmlFor={`${kind}-msg`}>
            <Textarea id={`${kind}-msg`} required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={placeholderMessage} />
          </Field>

          <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto">
            <Send className="size-4" />{busy ? "Sending..." : submitLabel}
          </Button>
        </form>
      )}
    </Card>
  );
}
