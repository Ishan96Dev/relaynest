import {
  BarChart3, Bell, BookOpen, Bot, Code2, CreditCard, Crown, Home, KeyRound, LayoutGrid, Puzzle,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, User, Users, Layers, Workflow, Zap, type LucideIcon,
} from "lucide-react";

export interface NavItem { label: string; href: string; icon: LucideIcon; section?: "Main" | "Workspace"; match?: (p: string) => boolean }

const starts = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p === x || p.startsWith(x + "/"));

/** Main sidebar, as in the dashboard / bots / analytics mockups. */
export const mainNav: NavItem[] = [
  { section: "Main", label: "Overview", href: "/dashboard", icon: Home, match: (p) => p === "/dashboard" },
  { section: "Main", label: "My Bots", href: "/bots", icon: Bot, match: (p) => (p === "/bots" || p.startsWith("/bots/")) && !p.startsWith("/bots/templates") },
  { section: "Main", label: "Bot Templates", href: "/bots/templates", icon: LayoutGrid, match: starts("/bots/templates") },
  { section: "Main", label: "Automations", href: "/agents", icon: Workflow, match: starts("/agents", "/workflows") },
  { section: "Main", label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen, match: starts("/knowledge-base") },
  { section: "Main", label: "Analytics", href: "/analytics", icon: BarChart3, match: starts("/analytics") },
  { section: "Workspace", label: "Integrations", href: "/integrations", icon: Puzzle, match: starts("/integrations") },
  { section: "Workspace", label: "Settings", href: "/settings/profile", icon: Settings, match: starts("/settings") },
];

/** "AI Platform" section of the sidebar. */
export const aiNav: NavItem[] = [
  { label: "Model Catalog", href: "/ai/models", icon: Layers, match: starts("/ai/models") },
  { label: "AI Agents", href: "/ai", icon: Sparkles, match: (p) => p === "/ai" || p.startsWith("/ai/agents") },
  { label: "Model Playground", href: "/ai/playground", icon: Code2, match: starts("/ai/playground") },
];
export const settingsNav: (NavItem & { description: string })[] = [
  { label: "Profile", href: "/settings/profile", icon: User, description: "Your personal information" },
  { label: "Workspace", href: "/settings/workspace", icon: Users, description: "Workspace name and members" },
  { label: "Security & Access", href: "/settings/security", icon: ShieldCheck, description: "Password, sessions and account security" },
  { label: "Notifications", href: "/settings/notifications", icon: Bell, description: "Email and application notifications" },
  { label: "API Keys", href: "/settings/api-keys", icon: KeyRound, description: "Create and manage API keys" },
  { label: "Billing", href: "/settings/billing", icon: CreditCard, description: "Subscription and payment information" },
  { label: "Preferences", href: "/settings/preferences", icon: SlidersHorizontal, description: "Theme, language and app settings" },
];

export interface Promo { icon: LucideIcon; title: string; body: string; cta: string; href: string; gradient?: boolean }

const upgrade = (body: string): Promo => ({ icon: Crown, title: "Upgrade to Pro", body, cta: "Upgrade Now", href: "/settings/billing", gradient: true });

/** Sidebar promo card per section, adapted to the workspace's active subscription plan. */
export function promoFor(p: string, planId: "free" | "pro" | "business" = "free"): Promo {
  if (p.startsWith("/ai")) return { icon: Zap, title: "AI Agents", body: "Build intelligent Telegram agents with AI models, tools and your own knowledge.", cta: "Create AI Agent", href: "/bots/new?type=ai" };
  if (p.startsWith("/settings/notifications")) return { icon: Bell, title: "Stay in the Loop", body: "Get important updates, security alerts, and product news from RelayNest.", cta: "Manage Notifications", href: "/settings/notifications" };
  if (p.startsWith("/settings/security")) return { icon: ShieldCheck, title: "Keep Your Account More Secure", body: "Enable 2FA and security alerts for stronger protection.", cta: "Enable 2FA", href: "/settings/security" };
  if (p.startsWith("/settings/api-keys")) return { icon: Code2, title: "Build with RelayNest", body: "Use our REST APIs & Swagger UI to build custom integrations and automated workflows.", cta: "Open Swagger UI", href: "/api-docs" };
  if (p.startsWith("/settings/preferences")) return { icon: Settings, title: "Customize Your Experience", body: "Tailor RelayNest to fit your workflow, style, and productivity needs.", cta: "Learn More", href: "/docs" };
  if (planId === "business") {
    return { icon: Crown, title: "Business Plan Active", body: "All workspace limits unlocked: up to 100 bots, unlimited executions, and priority support.", cta: "Manage Billing", href: "/settings/billing" };
  }
  if (planId === "pro") {
    return { icon: Crown, title: "Pro Plan Active", body: "Need up to 100 bots, unlimited executions, and unlimited team members? Scale to Business anytime.", cta: "View Business Plan", href: "/settings/billing", gradient: true };
  }
  if (p.startsWith("/analytics")) return upgrade("Unlock advanced analytics, longer data retention, and detailed execution logs.");
  if (p.startsWith("/bots/templates")) return upgrade("Unlock more templates, automations and premium features.");
  if (p.startsWith("/knowledge-base")) return upgrade("Get more storage, larger knowledge bases, and early access to AI features like RAG and Semantic Search.");
  if (p.startsWith("/workflows") || p.startsWith("/agents")) return upgrade("Unlock advanced automations, more executions and premium features.");
  if (p.startsWith("/settings/workspace")) return { icon: Layers, title: "Upgrade Workspace", body: "Unlock more members, workspaces, and advanced features.", cta: "Upgrade Now", href: "/settings/billing" };
  if (p.startsWith("/settings/billing")) return { icon: Crown, title: "Unlock More with RelayNest Pro", body: "Get more bots, higher limits, advanced automation, and powerful analytics.", cta: "Upgrade Plan", href: "/settings/billing" };
  if (p.startsWith("/settings")) return { icon: Layers, title: "Upgrade Workspace", body: "Unlock more members, workspaces, and advanced features.", cta: "Upgrade Now", href: "/settings/billing" };
  return upgrade("Unlock more bots, automations and premium features.");
}
