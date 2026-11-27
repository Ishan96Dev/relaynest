export interface KnowledgeSourceTemplate {
  id: string;
  name: string;
  /** Default Source title loaded into the knowledge form (max 120 chars). */
  title: string;
  category: string;
  tagline: string;
  /** Short search keywords / topic tags. */
  tags: string[];
  /** Production-ready Markdown reference text loaded into Source text (max 20,000 chars). */
  content: string;
}

/**
 * Curated, RAG-ready Knowledge Source templates tailored for Telegram AI Agent Bots.
 * Structured with clear headings, concise bullets, and Markdown tables so agents can
 * ground replies accurately and cite specific sections inline.
 */
export const KNOWLEDGE_SOURCE_TEMPLATES: KnowledgeSourceTemplate[] = [
  {
    id: "ks-refund-returns",
    name: "Refund & Return Policy",
    title: "Refund & Return Policy",
    category: "Customer Support",
    tagline: "Eligibility windows, return steps, non-refundable items, and payout timelines.",
    tags: ["refund", "returns", "exchange", "policy", "orders", "support"],
    content: `### Return & Refund Eligibility
- **Return window:** Items may be returned within **{{ReturnWindowDays}} days** of delivery in unused condition with original packaging.
- **Digital / subscription refunds:** Eligible within **{{DigitalRefundDays}} days** of initial purchase if usage is below {{UsageLimit}}.
- **Non-refundable items:** Gift cards, custom/personalized items, downloadable licenses already activated, and final-sale clearance items.

### How to Request a Return or Refund
1. Share your **Order ID** (e.g., \`#ORD-12345\`) and the email address used at checkout.
2. State the item(s) and reason for return (attach a photo if damaged or incorrect).
3. Our team issues a prepaid return label or refund confirmation within **{{ReviewTimeHours}} business hours**.

### Refund Processing Timelines
| Payment Method | Estimated Timeline After Approval |
| --- | --- |
| Original Credit / Debit Card | 5–7 business days |
| UPI / Instant Bank Transfer | 1–3 business days |
| Store Credit / Wallet | Instant |

### Damaged or Wrong Items
- Report damaged, defective, or missing items within **{{DamageReportHours}} hours** of delivery for a free replacement or full refund.
- For urgent billing or dispute escalations, contact **{{SupportEmail}}** or open a ticket at [Support Portal]({{SupportUrl}}).`,
  },
  {
    id: "ks-shipping-delivery",
    name: "Shipping & Order Tracking",
    title: "Shipping, Delivery & Order Tracking",
    category: "Customer Support",
    tagline: "Shipping tiers, rates table, cutoff times, tracking steps, and lost-package rules.",
    tags: ["shipping", "delivery", "tracking", "international", "orders", "logistics"],
    content: `### Shipping Options & Rates
| Shipping Method | Delivery Estimate | Cost | Free Shipping Threshold |
| --- | --- | --- | --- |
| Standard Shipping | {{StandardDays}} business days | {{StandardFee}} | Orders over {{FreeShipThreshold}} |
| Express Shipping | {{ExpressDays}} business days | {{ExpressFee}} | — |
| International Shipping | {{IntlDays}} business days | Calculated at checkout | — |

### Order Processing & Cutoffs
- Orders placed before **{{CutoffTime}} ({{Timezone}})** Monday–Friday ship the same business day.
- Orders placed on weekends or public holidays ship on the next business day.
- Address changes can only be made **before** a shipping label is generated.

### How to Track Your Order
1. Check your shipping confirmation email/SMS for the carrier tracking link.
2. Or visit [Track Order]({{TrackingUrl}}) and enter your **Order ID** and email address.
3. Tracking updates may take **12–24 hours** to appear after carrier pickup.

### International Customs & Lost Packages
- International buyers are responsible for local customs duties, VAT, or import taxes unless noted as DDP (Delivered Duty Paid).
- If tracking shows no movement for **{{LostPackageDays}} business days** or marked delivered but missing, contact **{{SupportEmail}}** with your Order ID.`,
  },
  {
    id: "ks-support-escalation",
    name: "Support Hours & Escalation Guide",
    title: "Support Channels, Hours & Escalation",
    category: "Customer Support",
    tagline: "Live hours, response SLAs, official contact channels, and human handoff rules.",
    tags: ["contact", "escalation", "sla", "hours", "helpdesk", "human"],
    content: `### Official Contact Channels
- **Telegram Support Bot:** Automated 24/7 help for FAQs and common requests.
- **Email Support:** {{SupportEmail}}
- **Help Center & Status:** [Help Center]({{HelpCenterUrl}}) | [System Status]({{StatusUrl}})
- **Human Support Handle:** {{HumanSupportHandle}}

### Support Hours
- **Live human support:** Monday–Friday, **{{SupportStartTime}} – {{SupportEndTime}} ({{Timezone}})**.
- **Weekends & Holidays:** Emergency outage and security monitoring only; standard tickets are answered the next business day.

### Response Time SLAs
| Plan / Issue Priority | First Human Response Target |
| --- | --- |
| Critical Outage / Billing Lockout | Within {{CriticalSla}} |
| Paid / Pro Customers | Within {{ProSla}} |
| Free / General Inquiries | Within {{StandardSla}} |

### When to Escalate to a Human Agent
- Unauthorized account access, suspected fraud, or security vulnerability reports.
- Refund exceptions, invoice corrections, VAT/GST billing updates, or enterprise contracts.
- Persistent technical errors after standard troubleshooting steps.

### Privacy & Security Reminder
- Never share passwords, one-time passcodes (OTPs), API secrets, or full payment card numbers in Telegram chat.`,
  },
  {
    id: "ks-product-faq",
    name: "Product & Account FAQ",
    title: "Frequently Asked Questions (FAQ)",
    category: "FAQ Assistant",
    tagline: "Ready-to-edit Q&A bank covering onboarding, billing, security, and cancellation.",
    tags: ["faq", "questions", "account", "onboarding", "billing", "troubleshooting"],
    content: `### Getting Started
**Q: What is {{ProductName}} and how do I get started?**
A: {{ProductName}} helps {{TargetAudience}} {{CoreValueProp}}. Create a free account at [Sign Up]({{SignupUrl}}), complete setup in under {{SetupMinutes}} minutes, and follow the [Quickstart Guide]({{QuickstartUrl}}).

**Q: Do I need a credit card to try {{ProductName}}?**
A: {{CreditCardRequiredAnswer}}

### Account & Security
**Q: How do I reset my password or update my email?**
A: Go to **Settings → Security & Access** or use the "Forgot password" link on the login page. Email changes require verification on the new address.

**Q: Can I invite teammates to my workspace?**
A: Yes. Workspace owners and admins can invite team members under **Settings → Workspace** with role-based permissions.

### Billing & Subscriptions
**Q: How do I upgrade, downgrade, or cancel my plan?**
A: Visit **Settings → Billing** at any time. Upgrades take effect immediately (prorated); cancellations remain active through the end of the current billing period.

**Q: Where can I download invoices or receipts?**
A: All past invoices and tax receipts are available in **Settings → Billing → Billing History**.

### Troubleshooting
**Q: What should I do if something isn't working as expected?**
A: Check [System Status]({{StatusUrl}}) first, refresh your session, and if the issue persists email **{{SupportEmail}}** with your account email, timestamp, and a brief description.`,
  },
  {
    id: "ks-company-overview",
    name: "Company Overview & Brand Facts",
    title: "About {{CompanyName}} & Quick Facts",
    category: "FAQ Assistant",
    tagline: "Mission, core features, target customers, official links, and legal info.",
    tags: ["about", "company", "brand", "facts", "links", "overview"],
    content: `### About {{CompanyName}}
- **Summary:** {{CompanyName}} builds {{OneLineDescription}} for {{TargetAudience}}.
- **Founded:** {{FoundedYear}} | **Headquarters:** {{Location}}
- **Mission:** {{MissionStatement}}

### Core Capabilities
- **{{Feature1Name}}:** {{Feature1Summary}}
- **{{Feature2Name}}:** {{Feature2Summary}}
- **{{Feature3Name}}:** {{Feature3Summary}}

### Why Customers Choose Us
- {{Differentiator1}}
- {{Differentiator2}}
- {{Differentiator3}}

### Official Links & Channels
- **Website:** [{{CompanyName}}]({{WebsiteUrl}})
- **Documentation:** [Docs]({{DocsUrl}})
- **Pricing:** [Plans & Pricing]({{PricingUrl}})
- **Updates & Community:** [Telegram Channel]({{TelegramChannelUrl}}) | [X / Twitter]({{SocialUrl}})

### Legal & Compliance
- **Legal Entity:** {{LegalEntityName}}
- **Privacy Policy:** [Privacy Policy]({{PrivacyUrl}})
- **Terms of Service:** [Terms]({{TermsUrl}})
- **General & Press Contact:** {{GeneralEmail}}`,
  },
  {
    id: "ks-pricing-plans",
    name: "Pricing Plans & Billing Guide",
    title: "Pricing Plans, Tiers & Billing",
    category: "Sales Assistant",
    tagline: "Tier comparison table, annual discounts, free trials, and enterprise quoting rules.",
    tags: ["pricing", "plans", "tiers", "billing", "discount", "sales", "enterprise"],
    content: `### Plans & Pricing Overview
| Plan | Monthly Price | Annual Price | Best For | Key Limits |
| --- | --- | --- | --- | --- |
| **Free** | $0 | $0 | Testing & hobby projects | {{FreeLimits}} |
| **Pro** | {{ProMonthly}} | {{ProAnnual}} | Solo builders & growing teams | {{ProLimits}} |
| **Business** | {{BusinessMonthly}} | {{BusinessAnnual}} | High-volume production & teams | {{BusinessLimits}} |
| **Enterprise** | Custom | Custom | Custom SLAs, SSO & dedicated support | Custom quotas |

### Billing & Trials
- **Annual billing savings:** Save **{{AnnualDiscountPercent}}%** when billed annually.
- **Free trial:** {{TrialTerms}}
- **Accepted payment methods:** Major credit/debit cards, {{OtherPaymentMethods}}, and wire/ACH invoicing for annual Enterprise plans.

### Approved Discounts & Quotes
- **Eligible discounts:** {{ApprovedDiscounts}} (do not promise unlisted discounts).
- **Enterprise / volume inquiries:** Collect the prospect's **name, work email, company size, and expected monthly volume**, and direct them to [Book a Demo]({{DemoUrl}}) or **{{SalesEmail}}**.`,
  },
  {
    id: "ks-product-catalog",
    name: "Product Catalog & Buying Guide",
    title: "Product Catalog & Buying Guide",
    category: "Sales Assistant",
    tagline: "Flagship SKUs, spec comparison table, bundles, sizing, and warranty coverage.",
    tags: ["catalog", "products", "ecommerce", "specs", "warranty", "shopping"],
    content: `### Featured Products
| Product | Price | Best For | Key Specs / Highlights | Link |
| --- | --- | --- | --- | --- |
| **{{Product1Name}}** | {{Product1Price}} | {{Product1BestFor}} | {{Product1Specs}} | [View]({{Product1Url}}) |
| **{{Product2Name}}** | {{Product2Price}} | {{Product2BestFor}} | {{Product2Specs}} | [View]({{Product2Url}}) |
| **{{Product3Name}}** | {{Product3Price}} | {{Product3BestFor}} | {{Product3Specs}} | [View]({{Product3Url}}) |

### How to Pick the Right Option
- **Budget / starter choice:** Recommend **{{Product1Name}}** when the shopper prioritizes value and essentials.
- **Most popular / balanced:** Recommend **{{Product2Name}}** for everyday performance and durability.
- **Flagship / pro choice:** Recommend **{{Product3Name}}** for maximum capacity or advanced features.

### Sizing, Compatibility & Bundles
- **Sizing / fit note:** {{SizingNote}}
- **Active bundles:** {{BundleDetails}}
- **Stock disclaimer:** Availability updates live on the product page; direct shoppers to the product link to confirm current stock.

### Warranty & Care
- All products include a **{{WarrantyDuration}}** limited warranty covering manufacturing defects.
- Care instructions and warranty claims: [Warranty Info]({{WarrantyUrl}}).`,
  },
  {
    id: "ks-community-rules",
    name: "Community Guidelines & Group Rules",
    title: "Community Rules & Safety Guidelines",
    category: "Community Manager",
    tagline: "Group etiquette, anti-scam warnings, official links, events, and mod reporting.",
    tags: ["community", "rules", "moderation", "telegram", "group", "safety", "scam"],
    content: `### Core Community Rules
1. **Be respectful:** Critique ideas, never people. Harassment, hate speech, and personal attacks result in an immediate ban.
2. **Stay on topic:** Keep discussions relevant to {{CommunityTopic}}. Use designated channels for off-topic chat.
3. **No spam or self-promotion:** Unsolicited affiliate links, mass-tagging, or promotional DMs are prohibited without admin approval.
4. **No NSFW or illegal content:** Keep all text, media, and stickers safe for work.
5. **Respect privacy:** Never post private personal information (doxxing) or leaked credentials.

### Anti-Scam & Official Admin Verification
- **Official admins NEVER DM you first** asking for money, crypto transfers, wallet seed phrases, passwords, or remote access.
- Only trust announcements posted in our official channel: [{{OfficialChannelName}}]({{OfficialChannelUrl}}).
- Official moderators: {{AdminHandles}}.

### Useful Links & Weekly Schedule
- **Getting Started Guide:** [Start Here]({{GettingStartedUrl}})
- **Announcements Channel:** [Announcements]({{OfficialChannelUrl}})
- **Weekly Community Call / AMA:** {{EventSchedule}}

### Reporting Violations
- Reply to the offending message with \`/report\` (if enabled) or message a listed admin with a link/screenshot of the violation.`,
  },
  {
    id: "ks-booking-services",
    name: "Services, Hours & Booking Policy",
    title: "Services, Pricing & Booking Policy",
    category: "Productivity",
    tagline: "Service menu, durations, business hours, location, and reschedule/no-show rules.",
    tags: ["booking", "appointments", "services", "schedule", "cancellation", "hours"],
    content: `### Services & Pricing
| Service | Duration | Price | Notes |
| --- | --- | --- | --- |
| **{{Service1Name}}** | {{Service1Duration}} | {{Service1Price}} | {{Service1Notes}} |
| **{{Service2Name}}** | {{Service2Duration}} | {{Service2Price}} | {{Service2Notes}} |
| **{{Service3Name}}** | {{Service3Duration}} | {{Service3Price}} | {{Service3Notes}} |

### Hours & Location
- **Hours:** {{BusinessHours}} ({{Timezone}})
- **Location / Address:** {{StreetAddress}} ([View Map]({{MapUrl}}))
- **Parking / Access:** {{AccessInstructions}}

### How to Book
- Share your **preferred service, date & time, full name, and phone/email**, or book directly online at [Booking Page]({{BookingUrl}}).
- Appointment requests sent in chat are **pending** until confirmed by staff or automated booking confirmation.

### Cancellation, Rescheduling & Late Policy
- **Free reschedule / cancel:** At least **{{CancelNoticeHours}} hours** before the appointment.
- **Late cancellation / no-show fee:** {{NoShowFeePolicy}}.
- **Late arrivals:** Arrivals more than **{{LateGraceMinutes}} minutes** late may need to be shortened or rescheduled.`,
  },
  {
    id: "ks-developer-api",
    name: "API Quickstart & Troubleshooting",
    title: "Developer Docs, API & Error Codes",
    category: "Productivity",
    tagline: "Base URLs, auth headers, rate limits, common HTTP errors, and webhook setup.",
    tags: ["api", "developer", "sdk", "errors", "webhooks", "troubleshooting", "docs"],
    content: `### API Basics & Authentication
- **Base URL:** \`{{ApiBaseUrl}}\`
- **Auth header:** \`Authorization: Bearer <API_KEY>\` (create keys in **Settings → API Keys**).
- **Content type:** \`application/json\` for all request and response payloads.
- **Official Docs & SDKs:** [API Reference]({{ApiDocsUrl}}) | [GitHub Examples]({{GithubUrl}})

### Rate Limits
| Tier | Requests / Minute | Burst / Concurrency |
| --- | --- | --- |
| Free | {{FreeRpm}} rpm | {{FreeConcurrency}} |
| Pro | {{ProRpm}} rpm | {{ProConcurrency}} |
| Business | {{BusinessRpm}} rpm | {{BusinessConcurrency}} |

### Common Error Codes & Fixes
- **\`400 Bad Request\`:** Verify JSON syntax, required fields, and parameter types against the schema.
- **\`401 Unauthorized\`:** API key missing, revoked, or has leading/trailing whitespace. Rotate key in dashboard if leaked.
- **\`403 Forbidden\`:** Key lacks required workspace scope or plan entitlement.
- **\`429 Too Many Requests\`:** Respect the \`Retry-After\` header and implement exponential backoff with jitter.
- **\`5xx Server Error\`:** Transient upstream issue; retry safely with an idempotency key and check [Status Page]({{StatusUrl}}).

### Webhooks & Bug Reports
- Verify webhook signatures using the \`{{WebhookSignatureHeader}}\` HMAC-SHA256 header against the raw request body.
- When reporting a bug, include the **HTTP status, \`X-Request-Id\`, endpoint, and UTC timestamp**—never paste live API keys.`,
  },
  {
    id: "ks-course-syllabus",
    name: "Course Syllabus & Study Guide",
    title: "Course Syllabus, Schedule & Grading",
    category: "Education",
    tagline: "Module timeline, grading weights, office hours, exam rules, and study links.",
    tags: ["course", "syllabus", "education", "study", "exam", "schedule", "tutor"],
    content: `### Course Overview
- **Course:** {{CourseName}} ({{CourseTerm}})
- **Instructor / Lead:** {{InstructorName}} ({{InstructorContact}})
- **Prerequisites:** {{Prerequisites}}
- **Learning Portal:** [Course Hub]({{CourseUrl}})

### Module Schedule
| Week / Module | Topic | Key Deliverable / Due Date |
| --- | --- | --- |
| Module 1 | {{Module1Topic}} | {{Module1Due}} |
| Module 2 | {{Module2Topic}} | {{Module2Due}} |
| Module 3 | {{Module3Topic}} | {{Module3Due}} |
| Module 4 | {{Module4Topic}} | {{Module4Due}} |

### Grading Rubric
- **Assignments & Labs:** {{AssignmentsWeight}}%
- **Quizzes / Participation:** {{QuizzesWeight}}%
- **Final Project / Exam:** {{FinalWeight}}%
- **Passing / Certificate Threshold:** {{PassingScore}}%

### Office Hours, Extensions & Academic Policy
- **Live Office Hours:** {{OfficeHoursSchedule}}
- **Late submissions:** {{LatePolicy}}
- **Study guidance:** Use this bot for concept explanations, practice quizzes, and hints—always submit your own original work.`,
  },
  {
    id: "ks-creator-brand-kit",
    name: "Creator Media Kit & Brand Voice",
    title: "Brand Voice, Content Pillars & Collab Info",
    category: "Entertainment",
    tagline: "Tone rules, audience profile, content pillars, sponsorship packages, and links.",
    tags: ["creator", "brand voice", "media kit", "sponsorship", "social", "content"],
    content: `### Brand & Audience Profile
- **Creator / Brand:** {{CreatorOrBrandName}}
- **Niche:** {{ContentNiche}}
- **Core Audience:** {{AudienceProfile}}
- **Tagline:** {{BrandTagline}}

### Voice & Tone Guidelines
- **Sound like:** {{ToneDos}} (e.g., sharp, warm, practical, conversational).
- **Avoid:** {{ToneDonts}} (e.g., corporate jargon, clickbait hype, generic filler phrases).
- **Formatting preferences:** Short hooks, crisp sentences, natural emoji usage (max 1–2 per post).

### Content Pillars
1. **{{Pillar1}}:** {{Pillar1Desc}}
2. **{{Pillar2}}:** {{Pillar2Desc}}
3. **{{Pillar3}}:** {{Pillar3Desc}}

### Sponsorships, Press & Official Links
- **Available formats:** {{CollabFormats}} (e.g., Newsletter feature, YouTube integration, Telegram spotlight).
- **Brand / sponsorship inquiries:** Email **{{CollabEmail}}** with campaign goals, timeline, and budget range.
- **Official Channels:** [YouTube]({{YoutubeUrl}}) | [Newsletter]({{NewsletterUrl}}) | [Merch / Store]({{StoreUrl}})`,
  },
];

const FALLBACK_QUICK_IDS = [
  "ks-refund-returns",
  "ks-product-faq",
  "ks-pricing-plans",
  "ks-company-overview",
] as const;

/**
 * Surfaces knowledge source templates matching the agent's category first,
 * followed by universally helpful starter sources (Refund policy, FAQ, Pricing, About).
 */
export function getQuickKnowledgeTemplates(category?: string, limit = 4): KnowledgeSourceTemplate[] {
  const matched = category
    ? KNOWLEDGE_SOURCE_TEMPLATES.filter((t) => t.category === category)
    : [];
  const fallbacks = FALLBACK_QUICK_IDS
    .map((id) => KNOWLEDGE_SOURCE_TEMPLATES.find((t) => t.id === id))
    .filter((t): t is KnowledgeSourceTemplate => Boolean(t));
  const seen = new Set<string>();
  const out: KnowledgeSourceTemplate[] = [];
  for (const t of [...matched, ...fallbacks, ...KNOWLEDGE_SOURCE_TEMPLATES]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
