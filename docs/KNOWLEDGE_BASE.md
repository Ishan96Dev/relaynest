# Knowledge Base (RAG)

Collections hold documents (PDF, TXT, Markdown up to 10 MB, or a public HTTPS web page). Each document is split into
overlapping chunks of about 1,000 characters. A collection can be shared with any bot, and with the Model Playground.

## Data flow

1. Upload: `POST /api/v1/knowledge/documents` stores the file in the private `knowledge` bucket and creates a `kb_documents`
   row with status `processing`. Indexing runs after the response (`after()`), and the page polls until it finishes.
2. Indexing (`processDocument` in `backend/src/server/services/knowledge.ts`): extract text, chunk, insert rows into
   `kb_chunks`, then (only if `MILVUS_URI` is set) embed the chunks with `nvidia/nemotron-3-embed-1b` (2048 dimensions) and
   upsert them into Milvus. A Milvus failure does not fail the document. It stays searchable by keyword and the row keeps a note.
3. Retrieval (`knowledge-retrieval.ts`): embed the question, search Milvus filtered by workspace and collection, then load the
   chunk text from Supabase. If Milvus is not configured, returns nothing, or errors, it uses `kb_keyword_search` (Postgres full text).

## Who uses it

| Consumer | Behaviour |
| --- | --- |
| AI agent bots (AI Agent wizard) | Top passages are added to the system prompt on every message (`ai-agent-runtime.ts`) and in the agent test chat. |
| Rule-based bots | If no command or keyword rule matches, a fast model answers from the passages only; without a model key it quotes the best passage. No hit falls back to the bot's default response (`telegram-webhook.ts`). |
| Model Playground | Pick collections in the Chat sidebar. Replies list their sources. |
| Knowledge Base page | "Semantic Search" box shows what a bot would receive. |

Sharing is stored in `kb_bot_links` (collection, bot). Manage it from a collection card (link icon) or a bot's **Knowledge** tab.

## Milvus setup

```env
MILVUS_URI=https://<endpoint>        # Zilliz Cloud public endpoint, or http://localhost:19530
MILVUS_TOKEN=<api key or user:password>
MILVUS_DB_NAME=                      # optional
MILVUS_COLLECTION=relaynest_knowledge
```

The server talks to the Milvus REST API v2 (Milvus 2.4+ or Zilliz Cloud). It creates the collection on first use
(`id`, `vector`, `workspace_id`, `collection_id`, `document_id`; COSINE, AUTOINDEX). The vector size is fixed by the embedding
model, so a different model needs a new `MILVUS_COLLECTION` name. Documents indexed before Milvus was configured show a
re-index button on the Knowledge Base page. Embeddings need `NVIDIA_API_KEY`.

## Security notes

- Writes to documents and chunks use the service role after an owner/admin check; members can read. Collections and links use RLS.
- Retrieved text and web pages are treated as data: prompts label them as reference material, never instructions.
- Web pages must be HTTPS and public (same SSRF guard as the workflow HTTP action, redirects re-checked, 2 MB cap).
- Original files are only reachable through 60-second signed URLs.
