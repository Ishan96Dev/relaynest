# Environment Variables

## 1. General rules

- `.env.local` is for local development and must not be committed.
- `.env.example` contains names and safe placeholders only.
- Production secrets belong in Cloudflare Worker Secrets or the relevant
  secret manager.
- Variables prefixed `NEXT_PUBLIC_` are browser-visible.
- Never prefix a secret with `NEXT_PUBLIC_`.

## 2. MVP variables

``` env
# App
NEXT_PUBLIC_APP_NAME=RelayNest
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_ENV=development

# Supabase public configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Supabase server-only secret key; use only if required by server operations
SUPABASE_SECRET_KEY=

# Optional direct PostgreSQL connection; not required when using Supabase client APIs
DATABASE_URL=

# Application encryption key; 32 bytes encoded as hex for the chosen crypto implementation
ENCRYPTION_KEY=
ENCRYPTION_KEY_VERSION=v1

# Telegram
TELEGRAM_API_BASE_URL=https://api.telegram.org

# Optional operational values
LOG_LEVEL=debug
```

## 3. Knowledge Base and future-only variables
```env
# Knowledge Base vector database (optional, see docs/KNOWLEDGE_BASE.md). Without it, retrieval uses keyword search.
MILVUS_URI=
MILVUS_TOKEN=
MILVUS_DB_NAME=
MILVUS_COLLECTION=relaynest_knowledge
```

``` env

# Cloudflare AI Gateway - future release
CLOUDFLARE_AI_GATEWAY_URL=
CLOUDFLARE_AI_GATEWAY_TOKEN=
```

Do not require future-only variables to boot the MVP.

## 4. Where to obtain values

### Supabase

1.  Create a Supabase project.
2.  Open the project dashboard.
3.  Find the Project URL and publishable key in the API Keys / Connect
    area.
4.  Find the server secret key in API Keys.
5.  Obtain the database connection string from the Connect panel if
    direct PostgreSQL access is required.

Use the current Supabase key naming. New projects may show publishable
and secret keys rather than legacy `anon` and `service_role` keys.

### Encryption key

Generate a 32-byte random key:

``` bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use a vetted authenticated encryption implementation such as
AES-256-GCM. Store the key only in a server-side secret store. Define a
key rotation plan.

### Cloudflare

- Account ID: Cloudflare dashboard account details.
- API token: Cloudflare profile → API Tokens. Create a scoped token with
  only the permissions needed for the workflow.
- Production secrets: Worker settings or Wrangler secret management.

Do not use the global API key.

### Telegram

The user supplies a bot token from BotFather. Do not use one shared
platform token for every user's bot. Encrypt each user's token
server-side.

### Milvus (future)

For managed Milvus, create a cluster with a managed provider and obtain
its endpoint and API credential. Do not deploy Milvus inside a Worker.

## 5. Environment validation

Validate required variables at server startup using a schema. Fail fast
with a message naming the missing variable, but never print its value.

Keep client and server environment schemas separate.

## 6. Cloudflare runtime bindings

Cloudflare production secrets and bindings may be provided through the
Worker environment rather than `.env` files. Create a typed environment
interface and map bindings in one module. Do not assume `process.env`
behaves exactly like a conventional Node.js process in every Worker
deployment mode.
