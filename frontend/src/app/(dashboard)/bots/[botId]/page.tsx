import { notFound } from "next/navigation";
import { BotDetail } from "@/components/bots/bot-detail";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { demoBots } from "@/lib/demo-data";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getBot } from "@backend/server/repositories/bots";
import { listBotHistory } from "@backend/server/services/bot-history";
import { syncBotWithTelegram } from "@backend/server/services/bots";
import type { Bot, BotHistoryEntry } from "@/types";

export const metadata = { title: "Bot Configuration" };

export default async function BotPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const demo = !isSupabaseConfigured();
  let bot: Bot | undefined;
  let history: BotHistoryEntry[] = [];

  if (demo) {
    bot = demoBots.find((b) => b.id === botId);
  } else {
    if (!uuid.safeParse(botId).success) notFound();
    try {
      const ctx = await requireAuth();
      const b = await syncBotWithTelegram(ctx, botId, { timeoutMs: 2_800 }).then((r) => r.bot).catch(() => getBot(ctx, botId));
      const allHistory = await listBotHistory(ctx).catch(() => []);
      history = allHistory.filter((h) => h.botId === b.id || (b.username && h.username.toLowerCase() === b.username.toLowerCase()));
      bot = {
        id: b.id, publicId: b.publicId, name: b.name, username: b.username ?? "", avatarPath: b.avatarPath, description: b.description ?? "",
        welcomeMessage: b.welcomeMessage ?? "", defaultResponse: b.defaultResponse ?? "", status: b.status,
        webhookStatus: b.webhookStatus as Bot["webhookStatus"], messages: b.messagesCount, activeUsers: 0,
        lastActive: b.lastUpdateAt ?? "No activity yet", category: b.category ?? "", createdAt: new Date(b.createdAt).toLocaleDateString(),
      };
    } catch {
      notFound();
    }
  }
  if (!bot) notFound();
  return <BotDetail bot={bot} initialHistory={history} demo={demo} />;
}
