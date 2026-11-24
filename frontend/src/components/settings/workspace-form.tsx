"use client";

import { Calendar, Check, Copy, Crown, Eye, Globe, Languages, Layers, Lock, Mail, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/toast";
import { Badge, ComingSoon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@backend/lib/supabase/lazy";
import { BUCKETS, IMAGE_UPLOAD, publicStorageUrl } from "@backend/lib/supabase/storage";
import { FileUpload, NO_PENDING, type PendingImage } from "@/components/ui/file-upload";
import { initialsOf } from "@/lib/initials";
import { PageTitle } from "@/components/motion/split-text";

export interface WorkspaceView { id: string; name: string; slug: string; description: string; createdAt: string; canEdit: boolean; isOwner: boolean; logoPath: string | null }
export interface MemberView { id: string; name: string; email?: string; role: string; joined: string; you: boolean }

const roleTone = (r: string) => (r === "owner" ? "primary" : r === "admin" ? "info" : "neutral") as "primary" | "info" | "neutral";

export function WorkspaceForm({ workspace, members, demo }: { workspace: WorkspaceView; members: MemberView[]; demo: boolean }) {
  const router = useRouter();
  const [name, setName] = React.useState(workspace.name);
  const [description, setDescription] = React.useState(workspace.description);
  const [nameErr, setNameErr] = React.useState<string>();
  const [state, setState] = React.useState<{ kind: "idle" | "saving" | "ok" | "error"; msg?: string }>({ kind: "idle" });
  React.useEffect(() => {
    if (state.kind === "ok") { toast.success("Workspace updated"); void fetch("/api/v1/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "workspace_updated" }) }); }
    else if (state.kind === "error" && state.msg) toast.error(state.msg);
  }, [state]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const editable = demo || workspace.canEdit;
  const [logoUrl, setLogoUrl] = React.useState(publicStorageUrl(BUCKETS.workspaceLogos, workspace.logoPath));
  const [logoPath, setLogoPath] = React.useState(workspace.logoPath);
  const [pending, setPending] = React.useState<PendingImage>(NO_PENDING);
  const dirty = name !== workspace.name || description !== workspace.description || pending.kind !== "none";
  /** Saves the details, and uploads a chosen logo to `workspace-logos/<workspace id>/` only now. Storage policies allow owners and admins only. */
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return setState({ kind: "error", msg: "Demo mode: connect Supabase to save." });
    if (!name.trim()) { setNameErr("Enter a workspace name."); requestAnimationFrame(() => document.getElementById("wname")?.focus()); return; }
    setState({ kind: "saving" });
    const sb = await createClient();
    const bucket = BUCKETS.workspaceLogos;
    let newPath: string | null | undefined;
    if (pending.kind === "set") {
      newPath = `${workspace.id}/logo-${Date.now()}.${pending.blob.type === "image/webp" ? "webp" : "png"}`;
      const up = await sb.storage.from(bucket).upload(newPath, pending.blob, { contentType: pending.blob.type, cacheControl: "31536000" });
      if (up.error) return setState({ kind: "error", msg: "Only owners and admins can change the logo." });
    } else if (pending.kind === "remove") newPath = null;
    const { error } = await sb.from("workspaces")
      .update({ name: name.trim(), description: description.trim() || null, ...(newPath !== undefined && { logo_path: newPath }) }).eq("id", workspace.id);
    if (error) {
      if (pending.kind === "set" && newPath) await sb.storage.from(bucket).remove([newPath]);
      return setState({ kind: "error", msg: "Could not update the workspace." });
    }
    if (newPath !== undefined) {
      if (logoPath) void sb.storage.from(bucket).remove([logoPath]);
      setLogoPath(newPath); setLogoUrl(publicStorageUrl(bucket, newPath));
    }
    setPending(NO_PENDING);
    setState({ kind: "ok" });
    router.refresh();
  }  async function remove() {
    const { error } = await (await createClient()).from("workspaces").delete().eq("id", workspace.id);
    if (error) { setConfirmOpen(false); setState({ kind: "error", msg: "Only the owner can delete the workspace." }); return; }
    await (await createClient()).auth.signOut();
    router.push("/login");
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex items-center gap-4"><IconTile size="xl" className="rounded-full"><Layers /></IconTile>
        <div><h1 className="text-3xl font-extrabold tracking-tight"><PageTitle text="Workspace Settings" /></h1><p className="text-sm text-foreground/80">Manage your workspace, members, and collaboration settings.</p></div></div>

      <form onSubmit={save}>
        <Card>
          <CardHeader title="Workspace Information" icon={<Layers />} tile action={workspace.isOwner || demo ? <Badge tone="primary" className="rounded-lg px-3 py-1.5 text-xs"><Crown className="size-3.5" aria-hidden />Owner Access</Badge> : undefined} />
          <div className="grid-cols-1 grid gap-5 p-5 pt-2 lg:grid-cols-[170px_1fr_240px]">
            <div>
              <FileUpload
                compact shape="square" size={256} value={logoUrl} pending={pending} onPendingChange={(p) => { setPending(p); setState({ kind: "idle" }); }} saving={state.kind === "saving"} maxBytes={IMAGE_UPLOAD.maxBytes} accept={IMAGE_UPLOAD.mimeTypes}
                title="Choose logo" fallback={initialsOf(name).slice(0, 1) || "W"}
                disabled={demo || !editable} disabledReason={demo ? "Demo mode: connect Supabase to upload a logo." : "Only owners and admins can change the logo."}
              />
              <p className="mt-1 text-center text-[11px] text-muted">PNG, JPG or WebP (max 2 MB)</p>
            </div>
            <div className="space-y-4">
              <div className="grid-cols-1 grid gap-4 sm:grid-cols-2">
                <Field label="Workspace Name" htmlFor="wname" required error={nameErr}><Input id="wname" value={name} maxLength={80} readOnly={!editable} onChange={(e) => { setName(e.target.value); setNameErr(undefined); setState({ kind: "idle" }); }} /></Field>
                <Field label="Workspace Slug" htmlFor="wslug" required hint={`relaynest.app/w/${workspace.slug}`}>
                  <Input id="wslug" readOnly value={workspace.slug} trailing={<button type="button" aria-label="Copy slug" onClick={() => { navigator.clipboard?.writeText(workspace.slug); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="grid-cols-1 grid size-7 place-items-center rounded text-muted hover:text-foreground">{copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}</button>} />
                </Field>
              </div>
              <Field label="Workspace Description" htmlFor="wdesc" counter={`${description.length} / 250`}><Textarea id="wdesc" maxLength={250} readOnly={!editable} value={description} onChange={(e) => { setDescription(e.target.value); setState({ kind: "idle" }); }} className="min-h-20" /></Field>
            </div>
            <div className="space-y-3 lg:border-l lg:border-border lg:pl-5">
              <div className="flex items-center gap-2.5 text-sm"><Calendar className="size-5 text-lavender" aria-hidden /><div className="leading-tight"><p className="text-xs text-muted">Workspace Created</p><p className="font-semibold">{workspace.createdAt}</p></div></div>
              <Button type="submit" className="w-full" disabled={!editable || !dirty || state.kind === "saving"}><Check className="size-4" />{state.kind === "saving" ? "Saving..." : "Update Workspace"}</Button>
              <Button type="button" variant="danger-outline" className="w-full" disabled={!demo && !workspace.isOwner} onClick={() => { setConfirm(""); setConfirmOpen(true); }}><Trash2 className="size-4" />Delete Workspace</Button>
            </div>
          </div>
        </Card>
      </form>

      <Card>
        <CardHeader title="Workspace Members" description="Manage members, roles, and access for this workspace." icon={<Users />} tile
          action={<><Badge tone="neutral" className="rounded-lg px-3 py-1.5"><ShieldCheck className="size-3.5" aria-hidden />Owners &amp; Admins only</Badge><Button disabled title="Invitations are not available yet."><Plus className="size-4" />Invite Member</Button></>} />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="rn-table min-w-[720px]">
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Joined Date</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td><span className="flex items-center gap-3 font-semibold"><span className="grid-cols-1 grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold" aria-hidden>{initialsOf(m.name)}</span>{m.name}{m.you && <Badge tone="neutral">You</Badge>}{m.role === "owner" && <Crown className="size-4 text-warn" aria-label="Owner" />}</span></td>
                  <td className="text-foreground/85">{m.email ?? "-"}</td>
                  <td><Badge tone={roleTone(m.role)} className="capitalize">{m.role}</Badge></td>
                  <td><Badge tone="success" dot>Active</Badge></td>
                  <td className="text-foreground/85">{m.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid-cols-1 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Invitations" description="Manage pending workspace invitations." icon={<Mail />} tile action={<ComingSoon />} />
          <div className="grid-cols-1 grid place-items-center px-5 pb-8 pt-2 text-center">
            <Users className="size-12 text-lavender/70" aria-hidden /><p className="mt-2 text-lg font-bold">No Pending Invitations</p><p className="text-sm text-foreground/75">Inviting teammates will be available in a future release.</p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Workspace Preferences" description="Configure default settings for your workspace." icon={<Globe />} tile action={<ComingSoon />} />
          <div className="space-y-3 px-5 pb-5" aria-disabled="true">
            {([[Globe, "Default Timezone", "Asia/Kolkata (GMT+05:30)"], [Languages, "Workspace Language", "English"], [Eye, "Default Visibility", "Private (Invited members only)"]] as const).map(([I, l, v]) => (
              <div key={l} className="grid-cols-1 grid grid-cols-[1fr_1.2fr] items-center gap-3 text-sm"><span className="flex items-center gap-2 text-foreground/85"><I className="size-4 text-lavender" aria-hidden />{l}</span><Select aria-label={l} disabled><option>{v}</option></Select></div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete Workspace?"
        icon={<IconTile tone="danger" size="md"><Trash2 /></IconTile>}
        footer={<><Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button variant="danger" disabled={demo || confirm !== "DELETE"} onClick={remove}><Lock className="size-4" />Delete Workspace</Button></>}
      >
        This will permanently delete &ldquo;{workspace.name}&rdquo;, including all bots, workflows, data, and member access. This action cannot be undone.
        <Input aria-label='Type "DELETE" to confirm' placeholder='Type "DELETE" to confirm' className="mt-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {demo && <span className="mt-2 block text-xs text-muted">Demo mode: deletion is disabled.</span>}
      </Modal>
    </div>
  );
}
