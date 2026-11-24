# Telegram Integration

## 1. Scope

Telegram is the first supported channel. RelayNest stores bot
configuration, validates bot tokens, configures webhooks, receives
updates, evaluates configured rules, and sends responses.

Official reference: https://core.telegram.org/bots/api

## 2. User setup flow

1.  User opens Telegram and starts a conversation with `@BotFather`.
2.  User runs `/newbot`.
3.  User provides display name and unique username.
4.  BotFather returns a token.
5.  User pastes the token into RelayNest over HTTPS.
6.  Backend calls Telegram `getMe`.
7.  Backend encrypts and stores token.
8.  User configures commands and responses.
9.  Backend registers webhook.
10. User tests the bot.

## 3. Token validation

Request: `GET https://api.telegram.org/bot<TOKEN>/getMe`

On success, persist safe metadata: - Telegram bot ID. - Username. -
Display name where returned. - Validation timestamp.

Never persist the token in application logs or return it in JSON.

## 4. Webhook registration

Use Telegram `setWebhook` with: - HTTPS URL. - A cryptographically
random `secret_token`. - Allowed update types limited to what the bot
needs.

Telegram sends the secret in the `X-Telegram-Bot-Api-Secret-Token`
header.

Store a secure representation of the webhook secret and compare safely.
Keep webhook secrets separate from bot tokens.

## 5. Webhook route

Suggested route: `POST /api/webhooks/telegram/:botPublicId`

Processing: 1. Resolve bot from public route identifier. 2. Load secret
verifier and encrypted bot credential server-side. 3. Validate Telegram
secret header. 4. Validate payload structure. 5. Extract `update_id`. 6.
Insert deduplication record. 7. If duplicate, acknowledge without
repeating side effects. 8. Persist or enqueue normalized event. 9.
Return promptly. 10. Process the event and store outcome.

## 6. Supported MVP update types

Start with: - `message` - `edited_message` only if required -
`callback_query` if inline keyboards are implemented - `my_chat_member`
/ `chat_member` for membership events where bot permissions and Telegram
update configuration support them

Do not subscribe to every update type by default.

## 7. MVP bot behaviour

- `/start`: configured welcome message.
- `/help`: configured help message or command list.
- Custom command: exact command match.
- Keyword response: configured matching mode and priority.
- Default response: fallback when no rule matches.

Define matching semantics explicitly: - Case sensitivity. - Whole-word
versus substring. - Priority ordering. - Whether commands are evaluated
before keyword rules. - Whether a response can be sent in groups or only
private chats.

## 8. Sending messages

Use Telegram `sendMessage`.

Support initially: - Plain text. - Optional parse mode only after safe
escaping/validation. - Chat ID from the incoming update or configured
destination.

Do not allow arbitrary Telegram API method invocation from workflow
configuration in MVP.

## 9. Security

- Treat bot tokens as high-value secrets.
- Encrypt with authenticated encryption.
- Restrict credential table access.
- Validate webhook secret header.
- Apply rate limits.
- Do not log full update bodies by default.
- Prevent SSRF through any URL-fetching workflow action.
- Handle Telegram API errors and retry-after hints.
- Never let a user select another workspace's bot by guessing an ID.

## 10. Operational handling

Record: - Last webhook received. - Last successful send. - Current
webhook state. - Last provider error code. - Safe error summary.

Provide actions: - Validate connection. - Re-register webhook. - Remove
webhook. - Pause bot. - Resume bot.

## 11. Testing

Test: - Valid and invalid token. - Valid webhook secret. - Invalid
webhook secret. - Duplicate `update_id`. - `/start` response. - Unknown
command fallback. - Telegram API timeout. - Telegram rate limit. - Bot
deactivation. - Deleted credential. - Cross-workspace bot access denial.
