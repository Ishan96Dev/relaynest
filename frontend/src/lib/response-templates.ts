export type ResponseTemplateScope = "standard" | "ai-agent";

export interface ResponseTemplate {
  id: string;
  scope: ResponseTemplateScope;
  name: string;
  category: string;
  tagline: string;
  tags: string[];
  /** Plain-text Telegram /start welcome message. Supports {{BotName}} auto-substitution. */
  welcomeMessage: string;
  /** Plain-text Telegram fallback message (unknown message for standard bots, outage fallback for AI agents). */
  fallbackMessage: string;
}

/**
 * Curated plain-text automatic response templates for Standard Telegram Bots.
 * Formatted cleanly for Telegram mobile screens without raw Markdown syntax
 * and kept comfortably under 1,000 characters.
 */
export const STANDARD_RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    id: "std-friendly-general",
    scope: "standard",
    name: "Friendly General Concierge",
    category: "General",
    tagline: "Warm greeting with quick command menu and polite fallback.",
    tags: ["general", "welcome", "concierge", "starter", "default"],
    welcomeMessage: `Hi there! Welcome to {{BotName}}.

Here is how to get started:
• /help — See all available commands
• /about — Learn what this bot can do

Pick a command from the menu below anytime.`,
    fallbackMessage: `Sorry, I didn't recognize that message.

Type /help to see the commands I understand.`,
  },
  {
    id: "std-customer-support",
    scope: "standard",
    name: "Customer Support Desk",
    category: "Customer Support",
    tagline: "Guides customers to FAQs, order help, or human support tickets.",
    tags: ["support", "helpdesk", "tickets", "orders", "refunds", "customer"],
    welcomeMessage: `Hello! Welcome to {{BotName}} Support.

How can we help you today?
• /faq — Browse quick answers to common questions
• /support — Open a support request with our team
• /help — View all available commands

Send a command to get started.`,
    fallbackMessage: `Sorry, I couldn't match your message to a command.

Try /faq for quick answers, or send /support to reach our team directly.`,
  },
  {
    id: "std-faq-helpcenter",
    scope: "standard",
    name: "FAQ & Help Center",
    category: "Customer Support",
    tagline: "Self-service FAQ hub with clear escalation to a human contact.",
    tags: ["faq", "help", "docs", "answers", "knowledge", "support"],
    welcomeMessage: `Welcome to the {{BotName}} Help Center!

Find instant answers anytime:
• /faq — Browse frequently asked topics
• /contact — Reach a human specialist
• /help — List all commands

Type a keyword or choose a command from the menu.`,
    fallbackMessage: `I couldn't find an exact answer for that.

Send /faq to browse common topics or /contact to speak with our team.`,
  },
  {
    id: "std-community-welcome",
    scope: "standard",
    name: "Community Group Welcome",
    category: "Community",
    tagline: "Welcomes new members and surfaces group rules, links, and events.",
    tags: ["community", "group", "rules", "onboarding", "moderation", "events"],
    welcomeMessage: `Welcome to the {{BotName}} community!

Glad to have you here. Useful shortcuts:
• /rules — Read the community guidelines
• /about — Explore our group & resources
• /help — See every available command

Jump in and say hello!`,
    fallbackMessage: `I didn't catch that command.

Send /rules for group guidelines or /help to see what I can do.`,
  },
  {
    id: "std-lead-capture",
    scope: "standard",
    name: "Sales & Lead Qualifier",
    category: "Marketing & Leads",
    tagline: "Converts new Telegram visitors into demos, quotes, and inquiries.",
    tags: ["sales", "leads", "demo", "pricing", "marketing", "inquiry"],
    welcomeMessage: `Hi! Welcome to {{BotName}}.

Interested in learning how we can help?
• /pricing — View plans and options
• /contact — Request a quick callback or demo
• /help — Browse all commands

Choose an option below to get started.`,
    fallbackMessage: `Thanks for reaching out! I work best with menu commands.

Send /pricing to view options or /contact to connect with our sales team.`,
  },
  {
    id: "std-ecommerce-store",
    scope: "standard",
    name: "E-Commerce Storefront",
    category: "E-Commerce",
    tagline: "Directs shoppers to your catalog, order tracking, and store support.",
    tags: ["ecommerce", "shop", "store", "catalog", "orders", "shipping"],
    welcomeMessage: `Welcome to {{BotName}}!

Explore our store right inside Telegram:
• /catalog — Browse featured products
• /order — Place or check an order
• /help — Shipping, returns & store support

Select a command from the menu to start shopping.`,
    fallbackMessage: `Sorry, I didn't understand that message.

Use /catalog to browse items, /order for order help, or /help for all options.`,
  },
  {
    id: "std-notifications-alerts",
    scope: "standard",
    name: "Alerts & Updates Channel",
    category: "Notifications",
    tagline: "Lets users subscribe, unsubscribe, and check live alert status.",
    tags: ["notifications", "alerts", "broadcast", "subscribe", "updates", "status"],
    welcomeMessage: `Hi! You've reached {{BotName}} Alerts.

Stay updated in real time:
• /subscribe — Turn on updates and alerts
• /unsubscribe — Pause notifications anytime
• /help — Manage your alert preferences

Send /subscribe to begin receiving updates.`,
    fallbackMessage: `This bot handles alert subscriptions via commands.

Send /subscribe to receive updates, /unsubscribe to opt out, or /help for more info.`,
  },
  {
    id: "std-booking-appointments",
    scope: "standard",
    name: "Booking & Appointments",
    category: "Productivity",
    tagline: "Streamlines scheduling, opening hours, and cancellation requests.",
    tags: ["booking", "appointments", "schedule", "calendar", "hours", "clinic"],
    welcomeMessage: `Welcome to {{BotName}}!

Manage your appointments in seconds:
• /book — Request a new appointment
• /hours — Check our opening times & location
• /cancel — Reschedule or cancel a booking

Send /book whenever you're ready.`,
    fallbackMessage: `Sorry, I didn't catch that.

Use /book to schedule an appointment, /hours for opening times, or /help for all commands.`,
  },
  {
    id: "std-feedback-survey",
    scope: "standard",
    name: "Feedback & Survey Bot",
    category: "Marketing & Leads",
    tagline: "Invites quick user ratings, feature ideas, and comments.",
    tags: ["feedback", "survey", "reviews", "ratings", "nps", "poll"],
    welcomeMessage: `Thanks for stopping by {{BotName}}!

Your feedback helps us improve:
• /feedback — Share a suggestion or report an issue
• /rate — Leave a quick experience rating
• /help — See available options

It only takes a moment — thank you!`,
    fallbackMessage: `Thanks for your message! To make sure your input is logged properly, please use /feedback or /rate.`,
  },
  {
    id: "std-personal-assistant",
    scope: "standard",
    name: "Personal Notes & Reminders",
    category: "Productivity",
    tagline: "Quick utility greeting for saving notes, links, and reminders.",
    tags: ["productivity", "notes", "reminders", "tasks", "todo", "personal"],
    welcomeMessage: `Hey! {{BotName}} is ready to help you stay organized.

Quick actions:
• /note — Save a quick note or link
• /remind — Set a reminder
• /help — View all shortcuts

Send a command whenever something comes to mind.`,
    fallbackMessage: `I didn't recognize that shortcut.

Try /note to save something, /remind to set a reminder, or /help to see all commands.`,
  },
  {
    id: "std-developer-helpdesk",
    scope: "standard",
    name: "Developer & API Helpdesk",
    category: "Developer",
    tagline: "Helps developers check docs, system status, and file bug reports safely.",
    tags: ["developer", "api", "docs", "status", "bugs", "devops", "tech"],
    welcomeMessage: `Welcome to {{BotName}} Developer Helpdesk.

Useful commands:
• /docs — API references & quickstarts
• /status — Current service health
• /help — Full command list

Reminder: Never share live API keys or tokens in chat.`,
    fallbackMessage: `Unknown command or query.

Use /docs for documentation, /status for service health, or /help to view all commands. Please avoid pasting private API keys here.`,
  },
  {
    id: "std-education-course",
    scope: "standard",
    name: "Course & Study Hub",
    category: "Education",
    tagline: "Welcomes students to lessons, practice quizzes, and study guides.",
    tags: ["education", "course", "study", "quiz", "learning", "students"],
    welcomeMessage: `Welcome to {{BotName}}!

Ready to learn something new?
• /lessons — Browse available topics
• /quiz — Test your knowledge
• /help — See all study commands

Pick a command to start today's session.`,
    fallbackMessage: `I didn't understand that input.

Send /lessons to explore topics, /quiz to practice, or /help to see all commands.`,
  },
];

/**
 * Curated plain-text welcome & outage-fallback templates for Telegram AI Agent Bots.
 * Every message stays well below the 1,000-character AI agent limit.
 */
export const AI_AGENT_RESPONSE_TEMPLATES: ResponseTemplate[] = [
  {
    id: "ai-general-assistant",
    scope: "ai-agent",
    name: "Smart AI Assistant",
    category: "General",
    tagline: "Natural conversation welcome with a calm retry fallback.",
    tags: ["assistant", "general", "chat", "ai", "starter"],
    welcomeMessage: `Hi! I'm {{BotName}}, your AI assistant on Telegram.

Just send me a message in plain language and I'll do my best to help. You can also send /help to see commands or /reset anytime to start a fresh conversation.`,
    fallbackMessage: `Sorry, I ran into a temporary hiccup and couldn't generate a reply right now. Please try again in a moment, or send /reset to start fresh.`,
  },
  {
    id: "ai-customer-support",
    scope: "ai-agent",
    name: "24/7 AI Customer Support",
    category: "Customer Support",
    tagline: "Invites policy/order questions and escalates cleanly during outages.",
    tags: ["support", "orders", "refunds", "helpdesk", "escalation"],
    welcomeMessage: `Hi! I'm {{BotName}}, your 24/7 support assistant.

Ask me anything about orders, shipping, billing, or our policies — just type your question below. (Please never share passwords or full card numbers here.)`,
    fallbackMessage: `Sorry, I'm having trouble connecting right now and couldn't answer that. Please try again shortly or reach our human support team at {{SupportContact}}.`,
  },
  {
    id: "ai-faq-knowledge",
    scope: "ai-agent",
    name: "Knowledge Base & Docs AI",
    category: "FAQ Assistant",
    tagline: "Sets grounded-docs expectations with a helpful documentation fallback.",
    tags: ["faq", "knowledge base", "rag", "docs", "documentation"],
    welcomeMessage: `Hello! I'm {{BotName}}, trained on our official FAQs and documentation.

Ask any question in your own words and I'll pull the relevant steps and answers for you right away.`,
    fallbackMessage: `I couldn't fetch an answer right now. Please try rephrasing your question in a moment, or check our documentation at {{DocsUrl}}.`,
  },
  {
    id: "ai-sales-advisor",
    scope: "ai-agent",
    name: "Inbound Sales Advisor",
    category: "Sales Assistant",
    tagline: "Welcomes product inquiries and keeps warm leads engaged if offline.",
    tags: ["sales", "leads", "pricing", "demo", "advisor"],
    welcomeMessage: `Hi! I'm {{BotName}}, here to help you explore plans, features, and the best fit for your needs.

Tell me what you're looking to accomplish and I'll point you in the right direction!`,
    fallbackMessage: `Sorry, I couldn't process that right now. Please try again in a moment, or contact our team at {{SupportContact}} so we can follow up directly.`,
  },
  {
    id: "ai-community-manager",
    scope: "ai-agent",
    name: "Community AI Host",
    category: "Community Manager",
    tagline: "Friendly welcome for group onboarding with moderator fallback.",
    tags: ["community", "group", "welcome", "rules", "moderator"],
    welcomeMessage: `Welcome! I'm {{BotName}}, your community guide.

Ask me about community rules, upcoming events, or how to get started — I'm happy to help anytime.`,
    fallbackMessage: `Sorry, I'm temporarily unavailable to answer that. Please try again shortly or ping a community moderator if it's urgent.`,
  },
  {
    id: "ai-ecommerce-concierge",
    scope: "ai-agent",
    name: "Shopping Concierge AI",
    category: "Sales Assistant",
    tagline: "Helps shoppers compare items, sizing, and delivery details.",
    tags: ["ecommerce", "shop", "catalog", "products", "concierge"],
    welcomeMessage: `Welcome! I'm {{BotName}}, your personal shopping assistant.

Tell me what you're looking for — budget, style, or specs — and I'll recommend the best options and answer shipping or return questions.`,
    fallbackMessage: `Sorry, I couldn't check that for you right now. Please try sending your message again in a moment, or reach store support at {{SupportContact}}.`,
  },
  {
    id: "ai-tech-helpdesk",
    scope: "ai-agent",
    name: "Developer Tech Helpdesk",
    category: "Customer Support",
    tagline: "Prompts devs for errors/versions and reminds them not to share secrets.",
    tags: ["developer", "tech support", "debugging", "api", "errors"],
    welcomeMessage: `Hi! I'm {{BotName}}, your technical support assistant.

Share the error message, SDK version, or integration question you're working on and I'll help troubleshoot it. Please avoid pasting live API keys or private tokens.`,
    fallbackMessage: `Sorry, I hit a temporary error while analyzing your request. Please retry in a few seconds, or reach engineering support at {{SupportContact}}.`,
  },
  {
    id: "ai-study-coach",
    scope: "ai-agent",
    name: "Study Coach & Exam Tutor",
    category: "Education",
    tagline: "Encouraging learning welcome with a smooth retry fallback.",
    tags: ["education", "tutor", "study", "quiz", "learning"],
    welcomeMessage: `Hi! I'm {{BotName}}, your study coach.

Tell me what topic you'd like to learn, paste a problem you're stuck on, or ask for a quick practice quiz — we'll take it step by step!`,
    fallbackMessage: `Oops, I couldn't generate an explanation just now. Please try sending your question again in a moment!`,
  },
  {
    id: "ai-productivity-chief",
    scope: "ai-agent",
    name: "Personal AI Chief of Staff",
    category: "Productivity",
    tagline: "Ready for messy notes, task prioritization, and fast summaries.",
    tags: ["productivity", "planner", "summaries", "tasks", "chief of staff"],
    welcomeMessage: `Hey! {{BotName}} here, ready to help you stay on top of your day.

Send me a rough to-do list, forwarded text to summarize, or a reply you want drafted — I'll turn it into clear next steps.`,
    fallbackMessage: `I couldn't process that right now due to a brief service delay. Please resend your message in a few seconds.`,
  },
  {
    id: "ai-creative-studio",
    scope: "ai-agent",
    name: "Creative & Content Studio",
    category: "Entertainment",
    tagline: "Kickstarts copywriting, captions, and visual /imagine ideas.",
    tags: ["creative", "writing", "social media", "imagine", "captions"],
    welcomeMessage: `Hey creator! I'm {{BotName}}, your creative studio partner.

Ask me for punchy hooks, captions, newsletter drafts, or image ideas — and use /imagine <prompt> whenever you want to bring a visual to life.`,
    fallbackMessage: `My creative engine hit a brief snag and couldn't reply right now. Give it another try in a moment!`,
  },
];

export function getResponseTemplates(scope: ResponseTemplateScope): ResponseTemplate[] {
  return scope === "standard" ? STANDARD_RESPONSE_TEMPLATES : AI_AGENT_RESPONSE_TEMPLATES;
}

/**
 * Replaces `{{BotName}}` with the bot's actual name when available,
 * keeping `{{BotName}}` visible as an editable placeholder if no name is set yet.
 */
export function resolveResponseText(text: string, botName?: string): string {
  const clean = botName?.trim();
  if (!clean) return text;
  return text.replaceAll("{{BotName}}", clean);
}

/** Loose category matching so e.g. "E-commerce" matches "E-Commerce" and "Community" matches "Community Manager". */
export function matchesResponseCategory(templateCategory: string, preferredCategory?: string): boolean {
  const pref = preferredCategory?.trim().toLowerCase();
  if (!pref) return false;
  const cat = templateCategory.trim().toLowerCase();
  if (cat === pref) return true;
  if (cat.includes(pref) || pref.includes(cat)) return true;
  if (pref.includes("faq") && (cat.includes("support") || cat.includes("faq"))) return true;
  if (pref.includes("sales") && (cat.includes("sales") || cat.includes("leads"))) return true;
  if (pref.includes("lead") && (cat.includes("sales") || cat.includes("leads"))) return true;
  return false;
}

/** Returns quick-apply templates prioritized by the bot/agent's current category. */
export function getQuickResponseTemplates(
  scope: ResponseTemplateScope,
  preferredCategory?: string,
  limit = 4,
): ResponseTemplate[] {
  const all = getResponseTemplates(scope);
  if (!preferredCategory?.trim()) return all.slice(0, limit);
  const matched = all.filter((t) => matchesResponseCategory(t.category, preferredCategory));
  const others = all.filter((t) => !matchesResponseCategory(t.category, preferredCategory));
  return [...matched, ...others].slice(0, limit);
}

/** Checks if a template's welcome and/or fallback text matches the current field values. */
export function getResponseTemplateMatch(
  template: ResponseTemplate,
  activeWelcome?: string,
  activeFallback?: string,
  botName?: string,
): "both" | "welcome" | "fallback" | null {
  const curW = activeWelcome?.trim() ?? "";
  const curF = activeFallback?.trim() ?? "";
  const tplW = resolveResponseText(template.welcomeMessage, botName).trim();
  const tplF = resolveResponseText(template.fallbackMessage, botName).trim();
  const rawW = template.welcomeMessage.trim();
  const rawF = template.fallbackMessage.trim();
  const matchW = Boolean(curW) && (curW === tplW || curW === rawW);
  const matchF = Boolean(curF) && (curF === tplF || curF === rawF);
  if (matchW && matchF) return "both";
  if (matchW) return "welcome";
  if (matchF) return "fallback";
  return null;
}
