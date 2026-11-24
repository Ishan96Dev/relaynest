"use client";
/* Storage images are small, pre-resized user uploads served from the Supabase CDN, so next/image optimization adds nothing. */
/* eslint-disable @next/next/no-img-element */

import { Check, Crown, Mail, Puzzle, Shield, User, CreditCard, KeyRound, Bell, SlidersHorizontal, Users, ChevronRight, Camera } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import type { SessionUser } from "@backend/server/services/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { IconTile, type TileTone } from "@/components/ui/icon-tile";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS, IMAGE_UPLOAD, publicStorageUrl } from "@backend/lib/supabase/storage";
import { FileUpload, NO_PENDING, type PendingImage } from "@/components/ui/file-upload";
import { initialsOf } from "@/lib/initials";
import { PageTitle } from "@/components/motion/split-text";

const shortcuts: { href: string; icon: typeof Users; tone: TileTone; title: string; body: string }[] = [
  { href: "/settings/workspace", icon: Users, tone: "info", title: "Workspace", body: "Manage your workspace and members" },
  { href: "/settings/security", icon: Shield, tone: "success", title: "Security", body: "Update password and manage sessions" },
  { href: "/settings/notifications", icon: Bell, tone: "primary", title: "Notifications", body: "Configure email and app notifications" },
  { href: "/settings/api-keys", icon: KeyRound, tone: "amber", title: "API Keys", body: "Create and manage your API keys" },
  { href: "/integrations", icon: Puzzle, tone: "pink", title: "Integrations", body: "Connect Telegram and external services" },
  { href: "/settings/billing", icon: CreditCard, tone: "info", title: "Billing", body: "Manage your subscription and payments" },
  { href: "/settings/preferences", icon: SlidersHorizontal, tone: "primary", title: "Preferences", body: "Customize theme, language and other settings" },
];

export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const demo = user.demo;
  const [saved, setSaved] = React.useState(user.name);
  const [name, setName] = React.useState(user.name);
  const [nameErr, setNameErr] = React.useState<string>();
  const [state, setState] = React.useState<{ kind: "idle" | "saving" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  React.useEffect(() => {
    if (state.kind === "ok") { toast.success("Profile saved"); void fetch("/api/v1/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "profile_updated" }) }); }
    else if (state.kind === "error" && state.msg) toast.error(state.msg);
  }, [state]);
  const [avatarUrl, setAvatarUrl] = React.useState(user.avatarUrl);
  const [pending, setPending] = React.useState<PendingImage>(NO_PENDING);
  const dirty = name !== saved || pending.kind !== "none";
  const bucket = BUCKETS.avatars;
  /**
   * Saves everything in one step. A chosen picture is uploaded to `avatars/<user id>/` only now, then the profile row
   * and the token (which the header reads) are pointed at it, and the previous file is deleted.
   */
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return setState({ kind: "error", msg: "Demo mode: connect Supabase to save your profile." });
    if (!name.trim() || name.length > 80) { setNameErr(name.trim() ? "Use 80 characters or fewer." : "Enter your full name."); requestAnimationFrame(() => document.getElementById("pname")?.focus()); return; }
    setState({ kind: "saving" });
    const sb = await createClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return setState({ kind: "error", msg: "Your session expired. Sign in again." });
    const uid = session.user.id;
    const previous = session.user.user_metadata?.avatar_path as string | undefined;
    let avatarPath: string | null | undefined; // undefined = leave the picture unchanged
    if (pending.kind === "set") {
      avatarPath = `${uid}/avatar-${Date.now()}.${pending.blob.type === "image/webp" ? "webp" : "png"}`;
      const up = await sb.storage.from(bucket).upload(avatarPath, pending.blob, { contentType: pending.blob.type, cacheControl: "31536000" });
      if (up.error) return setState({ kind: "error", msg: "Could not upload your picture. Check the file and try again." });
    } else if (pending.kind === "remove") avatarPath = null;
    const { error } = await sb.from("profiles").update({ display_name: name.trim(), ...(avatarPath !== undefined && { avatar_path: avatarPath }) }).eq("id", uid);
    if (error) {
      if (pending.kind === "set" && avatarPath) await sb.storage.from(bucket).remove([avatarPath]);
      return setState({ kind: "error", msg: "Could not save your profile." });
    }
    // The header reads name and picture from the signed token, so update them there too and mint a fresh token.
    await sb.auth.updateUser({ data: { full_name: name.trim(), ...(avatarPath !== undefined && { avatar_path: avatarPath }) } });
    await sb.auth.refreshSession();
    if (avatarPath !== undefined && previous && previous !== avatarPath) void sb.storage.from(bucket).remove([previous]);
    if (avatarPath !== undefined) setAvatarUrl(publicStorageUrl(bucket, avatarPath));
    setPending(NO_PENDING);
    setSaved(name.trim()); setState({ kind: "ok" });
    router.refresh();
  }  return (
    <form onSubmit={save} className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex items-center gap-4">
        <IconTile size="xl" className="rounded-full"><User /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Profile" /></h1><p className="text-[15px] text-foreground/85">Manage your personal information and how you appear on RelayNest.</p></div>
      </div>

      <div className="card overflow-hidden">
        <div className="relative flex flex-wrap items-center gap-5 bg-gradient-to-r from-surface-2 to-primary/20 p-5">
          <div className="relative">
            {avatarUrl ? <img src={avatarUrl} alt="" width={104} height={104} className="size-[104px] rounded-full object-cover ring-2 ring-primary/70" />
              : demo ? <Image src="/images/illustrations/avatar.png" alt="" width={104} height={104} className="size-[104px] rounded-full object-cover ring-2 ring-primary/70" />
              : <span className="grid-cols-1 grid size-[104px] place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-3xl font-extrabold ring-2 ring-primary/70">{initialsOf(name)}</span>}
            <span className="grid-cols-1 absolute bottom-0 right-0 grid size-9 place-items-center rounded-full bg-primary ring-4 ring-surface-2" aria-hidden><Camera className="size-4" /></span>
          </div>
          <div className="leading-tight"><p className="text-2xl font-extrabold">{saved}</p><p className="mt-1 text-foreground/85">{user.email}</p>
            <Badge tone="primary" className="mt-3 px-3 py-1.5 text-sm"><Crown className="size-4" aria-hidden />{user.plan}</Badge></div>
          <Image src="/images/illustrations/profile-banner.png" alt="" width={285} height={160} className="pointer-events-none ml-auto hidden h-36 w-auto fade-edges md:block light:hidden" />
        </div>

        <div className="space-y-5 p-5">
          <h2 className="text-xl font-extrabold">Personal Information</h2>
          <div className="grid-cols-1 grid gap-5 md:grid-cols-2">
            <Field label="Full Name" htmlFor="pname" required error={nameErr}><Input id="pname" icon={<User />} value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setNameErr(undefined); setState({ kind: "idle" }); }} className="h-12" /></Field>
            <Field label="Email Address" htmlFor="pemail" hint="Email changes are handled through authentication settings."><Input id="pemail" icon={<Mail />} readOnly value={user.email} className="h-12" trailing={<Check className="size-5 rounded-full bg-success p-1 text-white" aria-label="Verified" />} /></Field>
          </div>
          <div>
            <p className="text-sm font-semibold">Avatar</p><p className="mb-3 text-sm text-foreground/75">Choose a picture, then click Save Changes to upload it. It is cropped to a square and resized to 512 &times; 512 automatically.</p>
            <FileUpload
              value={avatarUrl} pending={pending} onPendingChange={(p) => { setPending(p); setState({ kind: "idle" }); }} saving={state.kind === "saving"} shape="circle" size={512} maxBytes={IMAGE_UPLOAD.maxBytes} accept={IMAGE_UPLOAD.mimeTypes}
              title="Choose a profile picture" hint="Drag and drop, or click to browse. JPG, PNG or WebP up to 12 MB; we shrink it for you."
              fallback={demo ? <Image src="/images/illustrations/avatar.png" alt="" width={84} height={84} className="size-full object-cover" /> : initialsOf(name)}
              disabled={demo} disabledReason="Demo mode: connect Supabase to upload a picture."
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/70 pt-4">
            <Button variant="outline" onClick={() => { setName(saved); setPending(NO_PENDING); setState({ kind: "idle" }); }} disabled={!dirty}>Discard Changes</Button>
            <Button type="submit" disabled={!dirty || state.kind === "saving"}>{state.kind === "saving" ? "Saving..." : "Save Changes"}</Button>
          </div>
        </div>
      </div>

      <ul className="grid-cols-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((s) => (
          <li key={s.title}>
            <Link href={s.href} className="card lift group flex h-full items-center gap-3 p-4">
              <IconTile tone={s.tone} size="lg"><s.icon /></IconTile>
              <span className="min-w-0 flex-1 leading-tight"><span className="block font-bold">{s.title}</span><span className="block text-[13px] text-foreground/75">{s.body}</span></span>
              <ChevronRight className="size-5 shrink-0 text-foreground/80" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </form>
  );
}
