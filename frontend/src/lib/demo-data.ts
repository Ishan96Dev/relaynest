import type { Bot, BotTemplate, Execution } from "@/types";
/**
 * Illustrative sample data used until a Supabase project is connected.
 * Replace calls to these with repository reads (see src/server/repositories).
 */
export const demoBots: Bot[] = [
  { id: "bot_support", name: "SupportBot", username: "relay_support_bot", description: "A customer support bot to handle user queries, FAQs, and provide quick assistance.", status: "active", webhookStatus: "registered", messages: 5240, activeUsers: 1248, lastActive: "2 min ago", category: "Customer Support", createdAt: "Nov 10, 2026" },
  { id: "bot_community", name: "CommunityBot", username: "relay_community_bot", description: "Welcomes new members and enforces group rules.", status: "active", webhookStatus: "registered", messages: 3180, activeUsers: 842, lastActive: "7 min ago", category: "Community", createdAt: "Nov 11, 2026" },
  { id: "bot_notify", name: "NotifyBot", username: "relay_notify_bot", description: "Sends updates, alerts and announcements.", status: "active", webhookStatus: "registered", messages: 2420, activeUsers: 610, lastActive: "12 min ago", category: "Notifications", createdAt: "Nov 12, 2026" },
  { id: "bot_lead", name: "LeadBot", username: "relay_lead_bot", description: "Collects and organizes leads directly from Telegram.", status: "inactive", webhookStatus: "removed", messages: 980, activeUsers: 124, lastActive: "1 hour ago", category: "Marketing & Leads", createdAt: "Nov 12, 2026" },
  { id: "bot_faq", name: "FAQBot", username: "relay_faq_bot", description: "Answers frequently asked questions automatically.", status: "active", webhookStatus: "registered", messages: 610, activeUsers: 98, lastActive: "3 hours ago", category: "Customer Support", createdAt: "Nov 13, 2026" },
];

export const demoExecutions: Execution[] = [
  { id: "EXE-8F3A2C1D", botName: "SupportBot", trigger: "Command: /support", status: "succeeded", durationMs: 1240, startedAt: "Nov 16, 2026, 04:52 PM" },
  { id: "EXE-7D9B6E2F", botName: "NotifyBot", trigger: "Automation: Daily Update", status: "succeeded", durationMs: 2080, startedAt: "Nov 16, 2026, 04:45 PM" },
  { id: "EXE-6C4D9A8B", botName: "SupportBot", trigger: "Command: /help", status: "succeeded", durationMs: 890, startedAt: "Nov 16, 2026, 04:37 PM" },
  { id: "EXE-5B1E7F3A", botName: "AlertBot", trigger: "Webhook: Price Alert", status: "failed", durationMs: 2310, startedAt: "Nov 16, 2026, 04:28 PM" },
  { id: "EXE-4A9C2D7E", botName: "AutomationBot", trigger: "Automation: Schedule Message", status: "succeeded", durationMs: 1670, startedAt: "Nov 16, 2026, 04:22 PM" },
];

export const demoActivity = [
  { id: "a1", title: "Bot connected", detail: "@relay_support_bot was connected successfully.", when: "2 min ago", tone: "info" },
  { id: "a2", title: "Bot activated", detail: "@relay_support_bot is now active.", when: "5 min ago", tone: "success" },
  { id: "a3", title: "Automation executed", detail: "Daily notification workflow executed (1,240 users).", when: "18 min ago", tone: "primary" },
  { id: "a4", title: "Configuration updated", detail: "Commands and responses updated for @relay_faq_bot.", when: "1 hour ago", tone: "neutral" },
  { id: "a5", title: "Bot disconnected", detail: "@old_test_bot was disconnected.", when: "3 hours ago", tone: "danger" },
] as const;

export const demoTrend = [
  { day: "Nov 9", value: 3200 }, { day: "Nov 10", value: 4800 }, { day: "Nov 11", value: 4200 },
  { day: "Nov 12", value: 6900 }, { day: "Nov 13", value: 6100 }, { day: "Nov 14", value: 8800 },
  { day: "Nov 15", value: 12430 },
];

export const demoMessages = [
  { day: "Nov 10", messages: 2100, executions: 900 }, { day: "Nov 11", messages: 2600, executions: 1200 },
  { day: "Nov 12", messages: 2000, executions: 800 }, { day: "Nov 13", messages: 3300, executions: 1700 },
  { day: "Nov 14", messages: 4320, executions: 2100 }, { day: "Nov 15", messages: 2900, executions: 1500 },
  { day: "Nov 16", messages: 3400, executions: 1400 },
];

export const demoCommands = [
  { command: "/start", count: 1842, pct: 34 }, { command: "/help", count: 982, pct: 18.1 },
  { command: "/support", count: 756, pct: 13.9 }, { command: "/about", count: 564, pct: 10.4 },
  { command: "/faq", count: 402, pct: 7.4 },
];

export const demoTemplates: BotTemplate[] = [
  { id: "support", name: "Customer Support Bot", description: "Handle user queries, tickets and provide automated support.", category: "Customer Support", difficulty: "Easy", popular: true, uses: "12,480+", features: ["Automated FAQ responses", "Support ticket collection", "Escalate to human support", "Customizable welcome message"], commands: [{ command: "/start", description: "Start the bot and show welcome message" }, { command: "/help", description: "Show available commands and support options" }, { command: "/faq", description: "Show frequently asked questions" }, { command: "/support", description: "Create a new support ticket" }], requirements: ["A Telegram Bot Token from @BotFather", "Basic FAQ content or knowledge base", "Optional: Email or webhook for support notifications", "Optional: Team member Telegram IDs for escalation"], previewReply: "Hello! Welcome to our support bot.\n\nHow can we help you today?\n\n/faq - Frequently asked questions\n/support - Create a support ticket\n/help - View all commands" },
  { id: "community", name: "Community Manager Bot", description: "Manage your Telegram community with moderation and automation.", category: "Community", difficulty: "Medium", popular: true, uses: "8,320+", features: ["Member management", "Auto-moderation", "Rules & welcome message"], commands: [{ command: "/rules", description: "Show group rules" }, { command: "/help", description: "List commands" }] },
  { id: "notify", name: "Notification Bot", description: "Send updates, alerts and announcements to your users.", category: "Notifications", difficulty: "Easy", popular: true, uses: "9,110+", features: ["Broadcast messages", "Scheduled notifications", "Multi-topic channels"], commands: [{ command: "/subscribe", description: "Subscribe to updates" }, { command: "/unsubscribe", description: "Stop updates" }] },
  { id: "lead", name: "Lead Collection Bot", description: "Capture and manage leads directly from Telegram.", category: "Marketing & Leads", difficulty: "Medium", uses: "4,210+", features: ["Custom lead forms", "Store in CRM via webhook", "Auto follow-up"], commands: [{ command: "/start", description: "Begin lead form" }] },
  { id: "assistant", name: "Personal Assistant Bot", description: "A handy bot for notes, reminders, links and daily productivity.", category: "Productivity", difficulty: "Easy", uses: "5,870+", features: ["Set reminders & tasks", "Save notes and links", "Quick commands"], commands: [{ command: "/note", description: "Save a note" }, { command: "/remind", description: "Create a reminder" }] },
  { id: "ecommerce", name: "E-commerce Bot", description: "Run a simple store, take orders and manage customers.", category: "E-commerce", difficulty: "Medium", uses: "3,540+", features: ["Product catalog", "Order management", "Payment & shipping info"], commands: [{ command: "/catalog", description: "Browse products" }, { command: "/order", description: "Place an order" }] },
  { id: "faq", name: "FAQ Bot", description: "Answer common questions instantly with a menu of topics.", category: "Customer Support", difficulty: "Easy", uses: "6,030+", features: ["Topic menu", "Instant answers", "Hand-off to a human"], commands: [{ command: "/faq", description: "Browse frequently asked questions" }, { command: "/contact", description: "How to reach a human" }], welcomeMessage: "Hi! Ask me a question or send /faq to browse common topics.", defaultResponse: "I could not find that. Send /faq to see topics or /contact to reach a person." },
  { id: "booking", name: "Appointment Booking Bot", description: "Let customers request appointments and receive confirmations.", category: "Productivity", difficulty: "Medium", uses: "2,760+", features: ["Collect date and time", "Confirmation message", "Reminder before the visit"], commands: [{ command: "/book", description: "Request an appointment" }, { command: "/cancel", description: "Cancel a booking" }, { command: "/hours", description: "Show opening hours" }], welcomeMessage: "Welcome! Send /book to request an appointment or /hours to see when we are open.", defaultResponse: "Sorry, I did not get that. Use /book to schedule or /hours for opening times." },
  { id: "feedback", name: "Feedback Survey Bot", description: "Collect ratings and comments from your users.", category: "Marketing & Leads", difficulty: "Easy", uses: "3,190+", features: ["Star ratings", "Free-text comments", "Thank-you reply"], commands: [{ command: "/feedback", description: "Leave feedback" }, { command: "/rate", description: "Rate your experience" }], welcomeMessage: "Thanks for stopping by! Send /feedback to share your thoughts.", defaultResponse: "Send /feedback to leave a comment or /rate to give a rating." },
];
export const templateMessages: Record<string, { welcomeMessage: string; defaultResponse: string }> = {
  support: { welcomeMessage: "Hello! Welcome to our support bot. How can we help you today?", defaultResponse: "Sorry, I did not understand that. Send /faq for common questions or /support to open a ticket." },
  community: { welcomeMessage: "Welcome to the community! Send /rules to read the group rules.", defaultResponse: "I did not catch that. Send /help to see what I can do." },
  notify: { welcomeMessage: "Hi! Send /subscribe to receive our updates.", defaultResponse: "Send /subscribe to get updates or /unsubscribe to stop." },
  lead: { welcomeMessage: "Hi! Send /start to tell us a little about what you need.", defaultResponse: "Thanks for your message. Send /start to begin the short form." },
  assistant: { welcomeMessage: "Hi! I can save notes and set reminders. Try /note or /remind.", defaultResponse: "Try /note to save something or /remind to set a reminder." },
  ecommerce: { welcomeMessage: "Welcome to our store! Send /catalog to browse products.", defaultResponse: "Send /catalog to browse or /order to place an order." },
};

export const templateCategories = ["Customer Support", "Community", "Notifications", "Marketing & Leads", "Productivity", "E-commerce"];

export const demoUser = { name: "Ishan Chakraborty", email: "ishan@example.com", initials: "IC", plan: "Pro Plan" };
