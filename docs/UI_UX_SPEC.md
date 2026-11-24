# UI/UX Specification

## 1. Brand

- Product: RelayNest
- Tagline: Build Bots. Automate Tasks. Connect Everything.
- Style: premium, minimal, developer-focused SaaS
- Default theme: dark, with light theme support

## 2. Design tokens

  Token        Value
  ------------ -----------
  Primary      `#635BFF`
  Secondary    `#8B5CF6`
  Background   `#09090B`
  Surface      `#18181B`
  Border       `#27272A`
  Text         `#FAFAFA`
  Muted        `#A1A1AA`
  Success      `#22C55E`
  Warning      `#F59E0B`
  Danger       `#EF4444`

Use semantic CSS variables so light and dark themes can be changed
without rewriting components.

## 3. Public routes

  -----------------------------------------------------------------------
  Route                               Screen
  ----------------------------------- -----------------------------------
  `/`                                 Landing page

  `/features`                         Features

  `/use-cases`                        Use cases

  `/templates`                        Templates

  `/pricing`                          Pricing (can be a simple free-plan
                                      placeholder initially)

  `/docs`                             Documentation entry

  `/about`                            About

  `/contact`                          Contact

  `/login`                            Login

  `/signup`                           Registration

  `/forgot-password`                  Password recovery

  `/privacy`                          Privacy

  `/terms`                            Terms
  -----------------------------------------------------------------------

## 4. Authenticated routes

  Route                         Screen
  ----------------------------- ---------------------------------
  `/dashboard`                  Overview
  `/bots`                       Bot list
  `/bots/new`                   Bot wizard
  `/bots/[botId]`               Bot details
  `/bots/[botId]/edit`          Edit bot
  `/agents`                     Agent list
  `/agents/new`                 Create agent
  `/agents/[agentId]`           Agent overview
  `/workflows/[workflowId]`     Workflow editor
  `/integrations`               Integrations
  `/executions`                 Execution history
  `/executions/[executionId]`   Execution detail
  `/analytics`                  Analytics
  `/settings/profile`           Profile
  `/settings/workspace`         Workspace
  `/settings/api-keys`          API keys (future unless needed)
  `/settings/preferences`       Preferences

## 5. Dashboard shell

### Sidebar

- RelayNest logo and workspace switcher.
- Dashboard.
- Bots.
  - All Bots
  - Create Bot
  - Templates
- Agents.
  - All Agents
  - Create Agent
  - Templates
- Integrations.
  - Telegram
  - Webhooks
- Monitoring.
  - Execution History
  - Activity Logs
  - Analytics
- Knowledge Base --- Coming Soon.
- AI Models --- Coming Soon.
- AI Gateway --- Coming Soon.
- Settings.

### Header

- Breadcrumb.
- Search.
- Notifications.
- Documentation shortcut.
- Theme switch.
- User profile menu.

### Footer

- RelayNest brand.
- Version.
- Documentation.
- Support.
- System status.

## 6. Dashboard overview

Cards: - Total Bots. - Active Bots. - Total Agents. - Active
Workflows. - Executions. - Failed Executions.

Sections: - Recent activity. - Recent executions. - Bot performance. -
Quick actions.

Do not show fabricated analytics. Use a useful zero state for new
workspaces.

## 7. Bot list

Each bot card/row: - Bot avatar. - Bot name. - Telegram username. -
Status. - Webhook state. - Messages sent (if measured). - Last
activity. - Edit/manage menu.

Filters: - Search. - Status. - Category. - Sort by recent activity or
created date.

## 8. Bot creation wizard

Steps: 1. Bot information. 2. Telegram connection. 3. Commands. 4.
Responses. 5. Review and deploy.

Telegram token input: - Password-style masked field. - Reveal control
only while entering. - Clear warning not to share token. - Validate
button. - Safe success details after validation. - Never display the
stored token again.

## 9. Workflow builder

Layout: - Left node library. - Central pannable/zoomable canvas. - Right
configuration panel. - Top toolbar with agent name, save, test,
publish/activate.

Node groups: - Triggers. - Conditions. - Actions.

MVP node types: - Telegram message trigger. - Incoming webhook
trigger. - Schedule trigger. - Text contains condition. - Equals
condition. - HTTP status condition. - Telegram send-message action. -
HTTP request action. - Save record action.

Include: - Unsaved changes indicator. - Validation errors. - Node
configuration errors. - Empty canvas guidance. - Test run result. -
Keyboard-accessible alternative controls where practical.

## 10. Coming Soon UX

AI cards should: - Be visually recognizable as future features. - Show a
Coming Soon badge. - Explain intended value. - Be disabled and
non-interactive, or open a roadmap information panel. - Never imply that
an API or integration is operational.

## 11. Landing page content

Hero: **Automate Your Telegram. Simplify Your Workflow.**

Supporting copy: Create custom Telegram bots and powerful automation
workflows without managing complex bot infrastructure. Connect services,
automate repetitive tasks, and monitor everything from one workspace.

CTAs: - Get Started Free - Explore Templates

Sections: 1. Hero with product dashboard preview. 2. Feature grid. 3.
How it works. 4. Bot templates. 5. Agent workflow example. 6. AI
capabilities Coming Soon. 7. FAQ. 8. Final CTA. 9. Footer.

## 12. UX quality requirements

- Responsive desktop, tablet, and mobile.
- Clear loading, error, empty, and success states.
- Confirm destructive actions.
- Preserve unsaved workflow edits.
- Avoid unnecessary modal stacking.
- Use toasts for short confirmations.
- Use inline validation for forms.
- Provide accessible names for icon-only buttons.
- Do not rely on color alone to convey status.
