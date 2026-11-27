import { notFound } from "next/navigation";
import { BotDetail } from "@/components/bots/bot-detail";
import { isSupabaseConfigured } from "@backend/lib/env/public";
import { demoBots } from "@/lib/demo-data";
import { uuid } from "@backend/lib/validation/schemas";
import { requireAuth } from "@backend/server/auth/context";
import { getBot } from "@backend/server/repositories/bots";
import { getAiAgentByBotId } from "@backend/server/services/ai-agents";
import { listBotHistory } from "@backend/server/services/bot-history";
import { syncBotWithTelegram } from "@backend/server/services/bots";
import { getBotUsageStats } from "@backend/server/services/execution-trace";
import type { Bot, BotHistoryEntry } from "@/types";

export const metadata = { title: "Bot Configuration" };

function formatLastActive(iso: string | null): string {
  if (!iso) return "No activity yet";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hours ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

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
      const [allHistory, usageMap, linkedAgent] = await Promise.all([
        listBotHistory(ctx).catch(() => []),
        getBotUsageStats(ctx, [b.id]).catch(() => new Map<string, { executionsCount: number; activeUsers: number }>()),
        getAiAgentByBotId(ctx, b.id).catch(() => null),
      ]);
      const usage = usageMap.get(b.id) ?? { executionsCount: 0, activeUsers: 0 };
      history = allHistory.filter((h) => h.botId === b.id || (b.username && h.username.toLowerCase() === b.username.toLowerCase()));
      bot = {
        id: b.id,
        publicId: b.publicId,
        name: b.name,
        username: b.username ?? "",
        avatarPath: b.avatarPath,
        description: b.description ?? "",
        welcomeMessage: b.welcomeMessage ?? "",
        defaultResponse: b.defaultResponse ?? "",
        status: b.status,
        webhookStatus: b.webhookStatus as Bot["webhookStatus"],
        messages: Math.max(b.messagesCount, usage.executionsCount),
        activeUsers: usage.activeUsers,
        executionsCount: usage.executionsCount,
        lastActive: formatLastActive(b.lastUpdateAt),
        category: b.category ?? "",
        createdAt: new Date(b.createdAt).toLocaleDateString(),
        linkedAgentId: linkedAgent?.id ?? null,
        linkedAgentModelName: linkedAgent?.modelName ?? null,
        linkedAgentStatus: linkedAgent?.status ?? null,
      };
    } catch {
      notFound();
    }
  }
  if (!bot) notFound();
  return <BotDetail bot={bot} initialHistory={history} demo={demo} />;
}
