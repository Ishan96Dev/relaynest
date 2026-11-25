import { APP_VERSION } from "@/lib/app-version";

export type DocGroup =
  | "Start Here"
  | "Bots & Workflows"
  | "AI Platform"
  | "Analytics & Workspace"
  | "Compliance";
export type CalloutTone = "info" | "warning" | "danger" | "success";

export interface DocMediaItem {
  kind: "image" | "gif" | "video";
  src: string;
  alt: string;
  caption: string;
  poster?: string;
}

export interface DocCallout {
  tone: CalloutTone;
  badge: string;
  title: string;
  body: string;
}

export interface PageGuide {
  id: string;
  group: DocGroup;
  route: string;
  badge: string;
  title: string;
  purpose: string;
  iconKey:
    | "user"
    | "home"
    | "bot"
    | "pencil"
    | "sparkles"
    | "layout"
    | "workflow"
    | "book"
    | "cpu"
    | "brain"
    | "chart"
    | "puzzle"
    | "credit"
    | "key"
    | "code"
    | "shield";
  gif: DocMediaItem;
  callouts?: DocCallout[];
  screenshots: DocMediaItem[];
  steps: Array<{ title: string; detail: string; tip?: string }>;
}

export interface DocsReleaseVersion {
  version: string;
  label: string;
  releasedAt: string;
  isCurrent: boolean;
  summary: string;
  highlights: string[];
  guides: PageGuide[];
}

export const GROUPS: DocGroup[] = [
  "Start Here",
  "Bots & Workflows",
  "AI Platform",
  "Analytics & Workspace",
  "Compliance",
];

const V010_GUIDES: PageGuide[] = [
  {
    id: "auth-account",
    group: "Start Here",
    route: "/signup & /login",
    badge: "Account & Access",
    title: "Creating an Account & Signing In",
    purpose: "Register your RelayNest workspace, sign in with email or Google, and move seamlessly through full-screen greeting transitions.",
    iconKey: "user",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/auth-account.gif",
      alt: "Recorded walkthrough of signing in to RelayNest and greeting transition",
      caption: "Live Walkthrough: switch cleanly between Log In & Sign Up, submit credentials, and pass through the full-page greeting screen into Dashboard.",
    },
    callouts: [
      {
        tone: "info",
        badge: "Important Info",
        title: "One Workspace, Multiple Channels",
        body: "Creating an account automatically sets up your personal workspace so your bots, AI agents, Knowledge Base files, and notifications stay organized in one place.",
      },
      {
        tone: "warning",
        badge: "Security Notice",
        title: "Always Confirm Your Email Address",
        body: "After registering with email and password, click the confirmation link sent to your inbox before signing in from a new browser.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/login.png",
        alt: "RelayNest Log In screen with Google SSO, email and password fields",
        caption: "The Log In screen supports both email/password sign-in and one-click Continue with Google.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/auth-transition-full.png",
        alt: "Full-page RelayNest welcome greeting transition screen",
        caption: "Branded full-screen greeting shown cleanly when creating an account, logging in, or signing out.",
      },
    ],
    steps: [
      {
        title: "Open Sign Up to create your account",
        detail: "Click Get Started from the top bar, enter your Full Name, Email Address, and a strong Password (or click Continue with Google), then agree to Terms & Privacy and click Sign Up.",
      },
      {
        title: "Sign in & arrive smoothly on your Dashboard",
        detail: "After creating your account or signing in, RelayNest displays a personalized full-screen greeting transition while restoring your workspace and bots.",
        tip: "Forgot your password? Click Forgot password? right beneath the Password field to receive an instant reset email.",
      },
    ],
  },
  {
    id: "overview",
    group: "Start Here",
    route: "/dashboard",
    badge: "Home Screen",
    title: "Overview Dashboard & Notifications",
    purpose: "Your daily command center showing live bot counts, processed messages, active bots table, quick-action shortcuts, 7-day activity, and real-time notifications.",
    iconKey: "home",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/overview.gif",
      alt: "Recorded walkthrough of RelayNest Overview dashboard and Notifications bell",
      caption: "Live Walkthrough: checking dashboard KPIs, opening the Notification Bell popover, and scrolling recent workspace metrics.",
    },
    callouts: [
      {
        tone: "success",
        badge: "Pro Tip",
        title: "Press Ctrl+K Anywhere",
        body: "Use the top Command Search bar (or press Ctrl+K / Cmd+K) on any page to jump straight to a bot, template, workflow, or billing setting.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/dashboard.png",
        alt: "RelayNest Overview Dashboard showing KPI metrics, My Bots table, Quick Actions, and 7-Day Analytics",
        caption: "Overview Dashboard (/dashboard): monitor every bot metric and launch key workflows in one click.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/notifications-bell.png",
        alt: "RelayNest header Notification Bell popover open on dashboard",
        caption: "Notification Bell: get instant alerts for sign-ins, newly connected bots, Telegram sync warnings, workflow failures, and billing events.",
      },
    ],
    steps: [
      {
        title: "Review your 4 live KPI cards",
        detail: "Track Total Bots, Active Bots, Messages Processed, and Automation Executions right across the top of your screen.",
      },
      {
        title: "Use My Bots & Quick Actions",
        detail: "Inspect each bot's status badge directly in the dashboard table, or use Quick Actions (+ Create New Bot, Browse Templates, Connect Telegram Bot, Create Automation) to launch tasks in one click.",
      },
      {
        title: "Stay alerted with the Notification Bell",
        detail: "Whenever a bot goes offline, detects a new login, or gets deleted externally in Telegram, an unread badge lights up on the top-right bell icon.",
      },
    ],
  },
  {
    id: "my-bots",
    group: "Bots & Workflows",
    route: "/bots",
    badge: "Two-Way Sync & History",
    title: "My Bots, Two-Way Sync & History",
    purpose: "Manage every connected Telegram bot, keep status synchronized in real time with Telegram, handle external Telegram deletions safely, and inspect created & deleted bot histories.",
    iconKey: "bot",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/my-bots.gif",
      alt: "Recorded walkthrough of My Bots live Telegram sync and Bot Lifecycle History filters",
      caption: "Live Walkthrough: running Sync Telegram, filtering Created vs Deleted entries in Bot Lifecycle History, and opening a bot.",
    },
    callouts: [
      {
        tone: "danger",
        badge: "Critical Warning",
        title: "Deleted on Telegram? Delete & Recreate Promptly",
        body: "If you delete a bot inside Telegram (@BotFather) or revoke its token, RelayNest automatically flags it as 'Deleted on Telegram' with a red alert banner. Click 'Delete Bot Now' to clear the broken entry and connect a fresh bot cleanly.",
      },
      {
        tone: "warning",
        badge: "Important Behavior",
        title: "Deleting Here Wipes Your Telegram Config Cleanly",
        body: "Deleting a bot inside RelayNest automatically removes its webhook, drops queued updates, deletes menu commands, clears descriptions, and removes its bot photo on Telegram. Your configuration snapshot remains safely logged inside Bot Lifecycle History.",
      },
      {
        tone: "info",
        badge: "Important Info",
        title: "Merged Deleted History With Telegram Sync Badges",
        body: "Use the All, Created, and Deleted filter pills in Bot Lifecycle History. The Deleted view shows both RelayNest-deleted bots and external deletions labeled cleanly as Telegram Deleted — along with what each bot was used for and its saved setup.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/bots.png",
        alt: "RelayNest My Bots workspace listing active bots and Sync Telegram button",
        caption: "My Bots (/bots): run live Sync Telegram checks, search/filter cards, spot deleted-on-Telegram warnings, and jump into management.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/bots-history.png",
        alt: "RelayNest Bot Lifecycle History and Configuration log with All, Created, and Deleted filters",
        caption: "Bot Lifecycle History: view All, Created, and merged Deleted records (preserving Telegram Deleted badges), bot purpose, commands, and messages handled.",
      },
    ],
    steps: [
      {
        title: "Sync anytime with Telegram",
        detail: "RelayNest verifies bots automatically when you open My Bots, and you can also click Sync Telegram anytime to re-check handles, photos, and live status.",
      },
      {
        title: "Handle 'Deleted on Telegram' alerts safely",
        detail: "If Telegram returns an unauthorized or deleted bot response, RelayNest pauses polling/webhooks immediately, triggers an alert, and gives you one-click Delete Bot Now and Recreate Bot buttons.",
      },
      {
        title: "Filter All, Created, or Deleted History",
        detail: "Click Created or Deleted inside Bot Lifecycle History & Configuration to inspect past bots, what each bot was used for, configured commands, and whether removal happened in RelayNest or externally on Telegram.",
      },
    ],
  },
  {
    id: "manage-edit-bot",
    group: "Bots & Workflows",
    route: "/bots/[id]",
    badge: "Manage & Edit Bot",
    title: "Managing & Editing Your Bot",
    purpose: "Edit your bot's display profile, avatar, slash commands, welcome & fallback replies, linked knowledge docs, live Test Bot console, and Telegram controls from one tabbed editor.",
    iconKey: "pencil",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/manage-bot.gif",
      alt: "Recorded interactive GIF walkthrough navigating General, Commands, Responses, Settings tabs and Test Bot modal",
      caption: "Live Walkthrough: switching across General, Commands, Responses, and Settings tabs inside /bots/[id] plus opening the interactive Test Bot console.",
    },
    callouts: [
      {
        tone: "info",
        badge: "Live Telegram Sync",
        title: "Edits Sync Automatically With Telegram",
        body: "Saving changes to your bot's Display Name, Description, Profile Photo, or Slash Commands pushes those updates directly to Telegram — so users always see your latest branding in @Telegram.",
      },
      {
        tone: "success",
        badge: "Safe Testing",
        title: "Simulate Commands Before Messaging Real Chats",
        body: "Click Test Bot in the top bar and leave Chat ID empty to simulate how /start or custom commands respond locally without posting to any Telegram group.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/bot-detail.png",
        alt: "Manage Bot General Configuration tab for editing bot name, category, description, and avatar",
        caption: "General Configuration: edit bot name, category, description, and upload a custom photo synced directly to Telegram.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/bot-detail-commands.png",
        alt: "Manage Bot Commands tab editing Telegram slash commands and replies",
        caption: "Commands Tab: create, reorder, enable/disable slash commands (/start, /help, custom triggers) and publish to Telegram's command menu.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/bot-detail-responses.png",
        alt: "Manage Bot Responses tab showing welcome greeting and fallback reply editor",
        caption: "Responses Tab: configure /start welcome messages, fallback default replies, and keyword trigger responses.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/bot-detail-settings.png",
        alt: "Manage Bot Settings tab with Active toggle, Re-validate Telegram, and Danger Zone",
        caption: "Settings Tab: pause or activate your bot, rotate or copy the encrypted token securely, re-validate Telegram connectivity, or delete via Danger Zone.",
      },
    ],
    steps: [
      {
        title: "Edit General Profile & Bot Avatar",
        detail: "Update your bot's display Name, Category tag (used inside Bot History), Description, or upload a new photo (up to 2 MB) and click Save Changes to update RelayNest and Telegram together.",
      },
      {
        title: "Configure Commands & Chat Menu",
        detail: "Switch to the Commands tab to add or edit slash commands like /start, /pricing, or /faq along with their menu description and exact reply message.",
      },
      {
        title: "Set Welcome & Fallback Responses",
        detail: "In Responses, customize what new Telegram visitors receive after /start and set a polite default fallback reply whenever an unexpected message arrives.",
      },
      {
        title: "Control Online Status, Test & Rotate Tokens Safely",
        detail: "Under Settings, toggle Active Status to pause/resume live updates, Re-validate Telegram, Sync Telegram Photo, reveal or rotate a compromised @BotFather token, or delete cleanly via Danger Zone.",
      },
    ],
  },
  {
    id: "create-bot",
    group: "Bots & Workflows",
    route: "/bots/new",
    badge: "Step-by-Step Setup",
    title: "Create Your Bot (Wizard)",
    purpose: "Guided step-by-step wizard to connect a Telegram bot from @BotFather, import its identity automatically, choose rules or AI powers, and go live.",
    iconKey: "sparkles",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/create-bot.gif",
      alt: "Recorded walkthrough switching between Standard Telegram Bot and AI Agent Bot wizards",
      caption: "Live Walkthrough: choosing between Standard Telegram Bot rules and an AI Agent Bot assistant inside the guided setup wizard.",
    },
    callouts: [
      {
        tone: "warning",
        badge: "Keep Private",
        title: "Never Share Your BotFather Token Publicly",
        body: "Treat your Telegram Bot Token like a password. RelayNest encrypts tokens automatically before saving and never exposes them inside browser URLs or public pages.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/bots-new.png",
        alt: "RelayNest Create Your Bot 5-step wizard starting with Telegram connection",
        caption: "Step 1 of Create Bot (/bots/new): paste your @BotFather token and validate it with Telegram.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/bots-new-ai.png",
        alt: "Create Your AI Agent Bot wizard screen",
        caption: "Switch to AI Agent Bot at the top to launch an AI-powered assistant connected directly to Telegram.",
      },
    ],
    steps: [
      {
        title: "Choose Standard Telegram Bot or AI Agent Bot",
        detail: "Pick Standard Telegram Bot for slash commands and visual workflow triggers, or AI Agent Bot for conversational AI responses powered by your Knowledge Base.",
      },
      {
        title: "Step 1 — Create & Paste Your @BotFather Token",
        detail: "Open @BotFather in Telegram, send /newbot, set a display name and username ending in 'bot', copy the token, paste it into RelayNest, and click Validate Token.",
        tip: "Use the built-in Username Availability checker in Step 1 to verify if your desired @handle is free before submitting to @BotFather.",
      },
      {
        title: "Steps 2–5 — Sync profile, configure commands & publish",
        detail: "RelayNest imports your bot name, handle, and profile picture automatically. Add welcome copy and slash commands like /start or /help, then toggle your bot live.",
      },
    ],
  },
  {
    id: "templates",
    group: "Bots & Workflows",
    route: "/bots/templates",
    badge: "Quick Launch",
    title: "Bot Templates",
    purpose: "Browse ready-to-use Telegram bot templates for Customer Support, FAQs, Communities, Notifications, and Lead Capture, preview live sample chats, and clone one in seconds.",
    iconKey: "layout",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/templates.gif",
      alt: "Recorded walkthrough of filtering Bot Templates and opening the interactive preview drawer",
      caption: "Live Walkthrough: filtering templates by Customer Support and inspecting commands plus simulated chat inside the live Preview drawer.",
    },
    callouts: [
      {
        tone: "info",
        badge: "Quick Launch Tip",
        title: "Templates Pre-Fill Everything For You",
        body: "Clicking Use Template sends all commands, welcome copy, and fallback responses straight into the Create Bot wizard so you go live twice as fast.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/templates.png",
        alt: "RelayNest Bot Templates gallery with preview drawer and example commands",
        caption: "Bot Templates (/bots/templates): preview any template's commands and Telegram conversation demo before clicking Use Template.",
      },
    ],
    steps: [
      {
        title: "Filter by use case or popularity",
        detail: "Choose Popular, Beginner Friendly, or click category tiles including Customer Support, Community, Notifications, Marketing & Leads, Productivity, or E-commerce.",
      },
      {
        title: "Preview commands & chat bubbles on the right",
        detail: "Click Preview on any template card to view its included slash commands and simulated Telegram chat replies.",
      },
      {
        title: "Click Use Template",
        detail: "Paste your Telegram bot token into the pre-filled wizard and launch right away.",
      },
    ],
  },
  {
    id: "automations-executions",
    group: "Bots & Workflows",
    route: "/agents & /workflows/[id] & /executions",
    badge: "No-Code Automation",
    title: "Automations, Workflows & Executions",
    purpose: "Design visual multi-step message flows with triggers, conditions, delays, and actions, then inspect every real run inside Execution History.",
    iconKey: "workflow",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/automations.gif",
      alt: "Recorded walkthrough touring Automations list, Visual Workflow canvas, and Execution History",
      caption: "Live Walkthrough: navigating from Automations to the drag-and-drop Workflow Builder canvas and reviewing finished logs in Executions.",
    },
    callouts: [
      {
        tone: "info",
        badge: "Important Info",
        title: "Safe Draft vs Published Flows",
        body: "Edits made on the workflow canvas save safely without affecting active Telegram chats until you publish your automation.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/automations.png",
        alt: "RelayNest Automations list page",
        caption: "Automations (/agents): view active or paused automations and create new workflows.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/workflow-editor.png",
        alt: "RelayNest Visual Workflow Builder drag-and-drop canvas",
        caption: "Workflow Builder (/workflows/new): connect Trigger, Condition, Send Telegram Message, and Action blocks visually.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/executions.png",
        alt: "RelayNest Execution History log view",
        caption: "Execution History (/executions): verify every automation run's bot, trigger, outcome status, and timing.",
      },
    ],
    steps: [
      {
        title: "Create a new Automation",
        detail: "Open Automations from the sidebar and click + Create Automation to enter the visual workflow canvas.",
      },
      {
        title: "Connect Triggers, Conditions & Actions",
        detail: "Pick a Trigger block (Command /start, incoming keyword, webhook, or schedule), branch conversations with Condition nodes, and add Send Message or Button actions.",
      },
      {
        title: "Save, Publish & Monitor in Executions",
        detail: "Turn your workflow on and check Executions anytime to confirm every run succeeded and troubleshoot any failed step.",
      },
    ],
  },
  {
    id: "knowledge-base",
    group: "AI Platform",
    route: "/knowledge-base",
    badge: "Docs & FAQs",
    title: "Knowledge Base",
    purpose: "Upload handbooks, PDFs, Markdown docs, or website pages into structured collections so your bots always answer accurately from verified content.",
    iconKey: "book",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/knowledge-base.gif",
      alt: "Recorded walkthrough of Knowledge Base collections and search testing",
      caption: "Live Walkthrough: viewing uploaded collections and running live answer-matching tests inside Knowledge Base.",
    },
    callouts: [
      {
        tone: "success",
        badge: "Best Practice",
        title: "Group Documents by Topic",
        body: "Create focused collections like 'Pricing & Refunds' or 'Product Setup' so your AI bots pull concise, spot-on excerpts in every reply.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/knowledge-base.png",
        alt: "RelayNest Knowledge Base page with collections, file upload panel, and search test box",
        caption: "Knowledge Base (/knowledge-base): organize collections, upload PDF/TXT/MD or web URLs, link bots, and test search matches.",
      },
    ],
    steps: [
      {
        title: "Create a Knowledge Collection",
        detail: "Click + Create Collection at top right to organize documents by topic or bot purpose.",
      },
      {
        title: "Upload Files or Public Webpage Links",
        detail: "Drop PDF, TXT, or Markdown files (up to 10 MB) or add a public webpage URL so RelayNest indexes the latest text cleanly.",
      },
      {
        title: "Link to Bots & Verify Search Answers",
        detail: "Attach collections to any standard or AI bot and test real user queries right inside the Knowledge Base search panel.",
      },
    ],
  },
  {
    id: "model-catalog",
    group: "AI Platform",
    route: "/ai/models",
    badge: "AI Models",
    title: "Model Catalog",
    purpose: "Explore top AI models from Google, NVIDIA, Meta, Mistral AI, and more, compare strengths, and launch any model directly in the Playground.",
    iconKey: "cpu",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/model-catalog.gif",
      alt: "Recorded walkthrough of filtering Model Catalog and opening Model Overview details",
      caption: "Live Walkthrough: filtering free and specialty AI models and opening detailed capabilities inside the right-hand inspector.",
    },
    callouts: [
      {
        tone: "info",
        badge: "Free Models Included",
        title: "Test Zero-Cost Models Immediately",
        body: "Look for the Free filter chip at the top of Model Catalog to explore fast models included at no extra per-token cost while prototyping.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/ai-models.png",
        alt: "RelayNest AI Model Catalog showing model cards, provider filters, and model details drawer",
        caption: "Model Catalog (/ai/models): filter by Free, Reasoning, Coding, Image Generation, or Provider and inspect capabilities.",
      },
    ],
    steps: [
      {
        title: "Filter models by task or provider",
        detail: "Click category pills (Free, Reasoning, Coding, Image Generation, Multimodal) or select providers like Google, NVIDIA, Meta, or Mistral AI.",
      },
      {
        title: "Inspect details & open in Playground",
        detail: "Click any card to see supported inputs/outputs and context limits on the right panel, then click Try in Playground.",
      },
    ],
  },
  {
    id: "ai-agents-playground",
    group: "AI Platform",
    route: "/ai & /ai/playground",
    badge: "AI Assistants",
    title: "AI Agents & Model Playground",
    purpose: "Customize AI assistant personalities and instructions, connect Knowledge Base files, test real replies in Model Playground, and activate on Telegram.",
    iconKey: "brain",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/ai-agents.gif",
      alt: "Recorded walkthrough of AI Agents list and Model Playground prompt testing",
      caption: "Live Walkthrough: checking AI Agents status and entering test prompts inside Model Playground before publishing to Telegram.",
    },
    callouts: [
      {
        tone: "success",
        badge: "Pro Tip",
        title: "Test Prompt + Knowledge Before Going Live",
        body: "Always test edge-case questions in Model Playground or the AI Agent live preview before turning on Active status for real Telegram customers.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/ai-agents.png",
        alt: "RelayNest AI Agents directory listing configured Telegram AI assistants",
        caption: "AI Agents (/ai): view your AI assistants, selected models, active states, and Configure buttons.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/ai-agent-detail.png",
        alt: "RelayNest AI Agent configuration and test console page",
        caption: "Configure AI Agent (/ai/agents/[id]): update instructions, tone, connected knowledge collections, slash commands, and live test chat.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/ai-playground.png",
        alt: "RelayNest Model Playground split screen for prompt and Knowledge Base testing",
        caption: "Model Playground (/ai/playground): pick any model, adjust system instructions, tick Knowledge Base docs, and chat test live.",
      },
    ],
    steps: [
      {
        title: "Refine prompts in Model Playground",
        detail: "Pick a model, write clear system instructions, optionally enable Knowledge Base checkboxes, and verify responses live.",
      },
      {
        title: "Configure & Publish your AI Agent",
        detail: "Open AI Agents, fine-tune instructions, commands, welcome messages, and fallback replies, then toggle Active to answer live Telegram messages.",
      },
    ],
  },
  {
    id: "analytics",
    group: "Analytics & Workspace",
    route: "/analytics",
    badge: "Insights",
    title: "Analytics & Insights",
    purpose: "Track message trends, automation success rates, response latency, and most-triggered Telegram commands over 7-day or 30-day windows.",
    iconKey: "chart",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/analytics.gif",
      alt: "Recorded walkthrough of Analytics charts, outcomes breakdown, and trigger stats",
      caption: "Live Walkthrough: inspecting daily execution trends, success/failure outcomes, and command breakdowns inside Analytics.",
    },
    callouts: [
      {
        tone: "info",
        badge: "Plan Windows",
        title: "7-Day vs 30-Day History",
        body: "Free plans display rolling 7-day analytics; Pro and Business plans unlock extended 30-day insights and higher monthly quotas.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/analytics.png",
        alt: "RelayNest Analytics dashboard showing executions over time, daily outcomes, success donut, and top triggers",
        caption: "Analytics (/analytics): inspect executions over time, daily outcomes, top commands, and response times.",
      },
    ],
    steps: [
      {
        title: "Select your time window",
        detail: "Switch between Last 7 Days and Last 30 Days at top right to compare traffic spikes and response times.",
      },
      {
        title: "Monitor reliability & top commands",
        detail: "Use Success vs Failure breakdowns and Top Triggers to spot which bot commands users rely on most and catch delivery issues fast.",
      },
    ],
  },
  {
    id: "integrations",
    group: "Analytics & Workspace",
    route: "/integrations",
    badge: "Live Webhooks & Channels",
    title: "Integrations & Signed Webhooks",
    purpose: "Monitor connected Telegram bots, provision signed Incoming Webhooks for workflows, connect Slack/Discord/HTTPS channels, and run live Test Ping checks with instant bell notifications.",
    iconKey: "puzzle",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/integrations.gif",
      alt: "Recorded walkthrough of RelayNest Integrations, Test Ping, and signature snippets",
      caption: "Live Walkthrough: testing an outbound webhook channel, inspecting delivery latency, and switching integration code guides.",
    },
    callouts: [
      {
        tone: "warning",
        badge: "SSRF & Signing Protection",
        title: "Verify Signed Webhooks Over HTTPS",
        body: "Outbound channels require strict public HTTPS endpoints and attach HMAC-SHA256 headers (`X-RelayNest-Signature`). Incoming workflow endpoints validate `X-RelayNest-Secret` and deduplicate via `Idempotency-Key`.",
      },
      {
        tone: "success",
        badge: "Real-Time Feedback",
        title: "Automatic Notification Bell Alerts",
        body: "Every channel connection, live Test Ping outcome, or incoming webhook creation writes a real audit log and header bell notification automatically.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/integrations.png",
        alt: "RelayNest Integrations hub showing Telegram bots, Incoming Webhooks, Outbound Channel Integrations, and How to Integrate guide",
        caption: "Integrations (/integrations): manage Telegram channels, Incoming Webhooks, Outbound Slack/Discord/Webhook targets, and Test Ping results.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/notifications-bell.png",
        alt: "Header Notification Bell showing API key and integration test alerts",
        caption: "Live Notifications Bell: track newly created API keys, channel connections, and HTTP 200 webhook test confirmations in real time.",
      },
    ],
    steps: [
      {
        title: "1. Monitor Telegram & Incoming Workflow Webhooks",
        detail: "Inspect connected bots and click Add Webhook Trigger to generate a 24-char incoming endpoint URL and one-time secret for any workflow.",
      },
      {
        title: "2. Connect Slack, Discord, or Custom HTTPS Channels",
        detail: "Click Connect Integration, pick a provider and events (`bot.created`, `automation.published`, `execution.failed`, `api_key.created`), and click Test Ping to verify HTTP delivery cleanly.",
      },
      {
        title: "3. Copy Integration Snippets",
        detail: "Scroll down to How to Integrate with RelayNest to copy ready-made cURL, HMAC Node.js verification, and REST API examples.",
      },
    ],
  },
  {
    id: "api-integrations",
    group: "Analytics & Workspace",
    route: "/settings/api-keys & /api-docs",
    badge: "REST API & Swagger UI",
    title: "API Keys & In-App Swagger UI",
    purpose: "Generate SHA-256 hashed production API credentials in Supabase with granular scopes, test live workspace endpoints inside your authenticated In-App Swagger UI, and inspect real request charts and logs.",
    iconKey: "code",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/api-swagger.gif",
      alt: "Recorded walkthrough authorizing Bearer API key inside RelayNest In-App Swagger UI and executing live GET /api/v1/analytics",
      caption: "Live Walkthrough: opening In-App API & Swagger UI (/api-docs), authorizing an `rnk_live_...` Bearer token, and executing live workspace calls.",
    },
    callouts: [
      {
        tone: "danger",
        badge: "One-Time Secret Reveal",
        title: "Copy API Keys Immediately Upon Generation",
        body: "Plaintext `rnk_live_...` secrets are never stored in the database — only irreversible SHA-256 hashes persist in Supabase. Rotate or revoke compromised keys in one click.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/settings-api-keys.png",
        alt: "RelayNest Settings API Keys console showing Supabase Connected badge, created key prefix, scopes, and request count",
        caption: "Settings -> API Keys (/settings/api-keys): create, rotate, and revoke scoped Bearer keys and view 7-day request telemetry.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/api-swagger-ui.png",
        alt: "RelayNest In-App Interactive Swagger UI executing GET /api/v1/analytics with live HTTP 200 JSON response",
        caption: "In-App API & Swagger UI (/api-docs): explore OpenAPI 3.1 endpoints inside your authenticated workspace, copy cURL snippets, and run live requests.",
      },
    ],
    steps: [
      {
        title: "Generate a scoped workspace key",
        detail: "Visit Settings -> API Keys, click + Create New API Key, choose an expiration window (7, 30, 90 days, 1 year, or never), select minimum permission scopes, and save your one-time production token.",
      },
      {
        title: "Authorize & test inside In-App Swagger UI",
        detail: "Open Workspace -> API & Swagger (/api-docs), click Authorize Bearer Key, paste your token, expand any endpoint such as GET /api/v1/bots or GET /api/v1/analytics, and click Execute Live Request.",
      },
      {
        title: "Monitor live request logs & bell alerts",
        detail: "Every Bearer API request increments per-key request counters, populates the 7-day API Request Volume chart, and triggers security notifications when keys are created or revoked.",
      },
    ],
  },
  {
    id: "settings-billing",
    group: "Analytics & Workspace",
    route: "/settings/*",
    badge: "Workspace Settings",
    title: "Settings, Notifications & Billing",
    purpose: "Manage your profile, workspace members, password, active logins, permanent account deletion (with Supabase verification & confirmation emails), email/bell notifications, API keys, subscription plans, and theme preferences.",
    iconKey: "credit",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/settings.gif",
      alt: "Recorded walkthrough touring Profile, Security, Notifications, Billing INR pricing, and Preferences",
      caption: "Live Walkthrough: navigating Settings tabs, reviewing INR plans (Auto-renew, Prepaid & UPI QR) in Billing, and Security & Notification controls.",
    },
    callouts: [
      {
        tone: "danger",
        badge: "Account Security Alert",
        title: "Review New Login Alerts & Sessions",
        body: "If you receive a suspicious sign-in notification, visit Settings -> Security & Access immediately to change your password and sign out other browser sessions.",
      },
      {
        tone: "info",
        badge: "Flexible Billing",
        title: "INR Billing With Auto-Renew, Prepaid & UPI QR",
        body: "Upgrade cleanly inside Settings -> Billing in INR (\u20B9) via Card, NetBanking, UPI AutoPay, or UPI QR on Monthly or 20%-off Annual billing. USD ($) billing is coming soon.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/settings-billing.png",
        alt: "RelayNest Billing & Subscription screen showing Free, Pro, and Business plans in INR with USD coming soon",
        caption: "Billing & Subscription (/settings/billing): choose INR (\u20B9) Auto-renew vs One-time (Prepaid), Monthly vs Annual plans, or Pay via UPI QR (USD coming soon).",
      },
      {
        kind: "image",
        src: "/images/docs/pages/settings-profile.png",
        alt: "RelayNest Profile settings screen",
        caption: "Profile (/settings/profile): update your name, photo, bio, and personal contact info.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/settings-workspace.png",
        alt: "RelayNest Workspace settings screen",
        caption: "Workspace (/settings/workspace): rename your workspace and manage team members.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/settings-security.png",
        alt: "RelayNest Security & Access settings screen",
        caption: "Security & Access (/settings/security): update your password, sign out other sessions, or permanently delete your account with email confirmation.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/settings-notifications.png",
        alt: "RelayNest Notification preferences screen",
        caption: "Notifications (/settings/notifications): control email vs in-app bell alerts event by event.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/settings-api-keys.png",
        alt: "RelayNest API Keys settings screen",
        caption: "API Keys (/settings/api-keys): create and revoke personal workspace access keys.",
      },
      {
        kind: "image",
        src: "/images/docs/pages/settings-preferences.png",
        alt: "RelayNest Preferences appearance and accessibility screen",
        caption: "Preferences (/settings/preferences): choose Dark or Light theme, High Contrast, and Reduced Motion.",
      },
    ],
    steps: [
      {
        title: "Personal Profile, Workspace & Theme Preferences",
        detail: "Update your name & avatar under Profile, manage team collaborators under Workspace, and pick Dark/Light mode or Reduced Motion anytime under Preferences.",
      },
      {
        title: "Security, Account Deletion & Notification Preferences",
        detail: "Change passwords, clear active sessions, or open Danger Zone -> Delete Account in Security & Access (with optional Supabase verification mail, DELETE confirmation, and a branded account_deleted.html confirmation email sent to your inbox). Customize individual Email vs In-App bell notifications under Notifications.",
      },
      {
        title: "Plans & Payments under Billing",
        detail: "Upgrade between Free, Pro, and Business in INR (\u20B9), choosing recurring subscriptions, one-time prepaid passes, or UPI QR (USD coming soon).",
      },
    ],
  },
  {
    id: "security-compliance",
    group: "Compliance",
    route: "/compliance",
    badge: "GIGW · WCAG AA · VA/CA",
    title: "GIGW, Accessibility & Security Standards",
    purpose: "Review RelayNest platform commitments to GIGW governance, WCAG 2.1 Level AA accessibility, VA/CA zero-trust security controls, and mandatory app footer policies.",
    iconKey: "shield",
    gif: {
      kind: "gif",
      src: "/images/docs/gifs/compliance.gif",
      alt: "RelayNest GIGW, WCAG 2.1 AA, VA/CA compliance overview and footer policy navigation walkthrough",
      caption: "Live Walkthrough: reviewing the /compliance standards, public legal bar, and sticky workspace footer links.",
    },
    callouts: [
      {
        tone: "info",
        badge: "CI/CD Automated Gate",
        title: "Enforced Before Every Release",
        body: "All public pages, authenticated app footers, CSP/HSTS headers, skip-to-content landmarks, keyboard focus traps, and version lockstep are checked automatically via `pnpm audit:compliance`.",
      },
    ],
    screenshots: [
      {
        kind: "image",
        src: "/images/docs/pages/compliance-page.png",
        alt: "RelayNest GIGW, Accessibility & Security Standards overview page",
        caption: "GIGW & Accessibility (/compliance): full breakdown of WCAG 2.1 AA, VA/CA protection, and GIGW public standards.",
      },
    ],
    steps: [
      {
        title: "Accessible Workspace & Footer Navigation",
        detail: "Every screen supports full keyboard navigation, high contrast, screen-reader landmarks, and clear legal and support links inside both public and sticky dashboard footers.",
      },
      {
        title: "Keyboard & Media Shortcuts",
        detail: "Use Tab, Arrow keys, Escape, and Space/K media controls seamlessly across menus, modals, sidebars, Swagger UI, and the product video player.",
      },
    ],
  },
];

// Frozen archive of v0.0.9 documentation so historical version views never mutate when new releases launch.
const V009_GUIDES: PageGuide[] = V010_GUIDES.filter(
  (g) => !["manage-edit-bot", "api-integrations", "security-compliance"].includes(g.id),
).map((g) =>
  g.id === "my-bots"
    ? {
        ...g,
        badge: "Bot Directory (v0.0.9 Archive)",
        title: "My Bots",
        purpose: "View, filter, pause, or open connected bots in your RelayNest v0.0.9 workspace.",
        callouts: [
          {
            tone: "info",
            badge: "v0.0.9 Archive",
            title: "Earlier Release Snapshot",
            body: "Two-Way Telegram Sync alerts, merged Deleted History with Telegram Deleted labels, live API Keys, Swagger UI, and dedicated Manage/Edit Bot tabs arrived in v0.1.0.",
          },
        ],
        screenshots: [g.screenshots[0]!],
      }
    : g,
);

export const DOC_RELEASES: DocsReleaseVersion[] = [
  {
    version: APP_VERSION,
    label: `v${APP_VERSION} (Current)`,
    releasedAt: "November 24, 2026",
    isCurrent: true,
    summary:
      "Current workspace release featuring Live Supabase API Keys, In-App Swagger UI, Signed Webhooks & Integrations, Real-Time Bell Notifications, Two-Way Telegram Sync, and GIGW/WCAG/VA-CA Compliance.",
    highlights: ["Live API Keys", "In-App Swagger UI", "Signed Webhooks", "Two-Way Sync", "GIGW / WCAG AA"],
    guides: V010_GUIDES,
  },
  {
    version: "0.0.9",
    label: "v0.0.9 (Archived)",
    releasedAt: "November 18, 2026",
    isCurrent: false,
    summary:
      "Initial release documentation covering Workspace Onboarding, Dashboard, Standard & AI Agent Setup Wizard, Bot Templates, Visual Automations, Knowledge Base, Analytics, and Billing.",
    highlights: ["Bot Wizard", "Templates", "Visual Flows", "Knowledge Base", "Analytics & Billing"],
    guides: V009_GUIDES,
  },
];
