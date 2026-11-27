# Knowledge Base (RAG)

Collections hold documents up to 10 MB — **PDF**, **Word** (`.docx`, `.doc`, `.odt`, `.rtf`), **Excel / Spreadsheets** (`.xlsx`, `.xls`, `.ods`), **CSV / TSV**, **PowerPoint** (`.pptx`, `.odp`), **Plain Text** (`.txt`, `.log`), **Markdown** (`.md`, `.markdown`, `.mdx`), **Structured Data** (`.json`, `.jsonl`, `.yaml`, `.yml`, `.xml`), and **HTML** (`.html`, `.htm`) — plus public HTTPS websites (**Single Page**, **XML Sitemap**, or **Subpages Crawl**).

Each document is extracted and split into overlapping chunks of about 1,000 characters (spreadsheets and CSV files preserve column header labels on every row for accurate retrieval). A collection can be shared with any bot and with the Model Playground.

## Data flow

1. **Upload / Crawl**: `POST /api/v1/knowledge/documents` stores uploaded files in the private `knowledge` bucket or saves a website crawl job (`single`, `sitemap`, or `subpages` with configurable max pages, depth, path prefix, and exclude patterns) in `kb_documents` with status `processing`. Ingestion runs after the response (`after()`), streaming step-by-step progress to `kb_ingestion_logs` while the UI polls live logs in real time (`GET /api/v1/knowledge/logs` and `GET /api/v1/knowledge/documents/:id/logs`).
2. **Web Scraping Resilience**: `backend/src/server/knowledge/scrape.ts` uses realistic browser navigation headers with SSRF-checked redirects and per-session cookie forwarding + origin warm-up (preventing CDN/Akamai HTTP 520 and HTTP/2 stream resets on sites such as NSE India). If direct fetch is rejected from an edge IP or encounters a client-rendered SPA shell, it automatically falls back to configured web readers (`FIRECRAWL_API_KEY`, `JINA_API_KEY`, `TINYFISH_API_KEY`).
3. **Indexing (`processDocument` in `backend/src/server/services/knowledge.ts`)**: extracts text, chunks per page (preserving `source_url` and `page_title` on each `kb_chunks` row for multi-page citations), inserts into `kb_chunks`, and (when `MILVUS_URI` is set) embeds chunks and upserts them into Milvus. A Milvus failure does not fail the document; it stays searchable by keyword.
4. **Retrieval (`knowledge-retrieval.ts`)**: hybrid vector + Postgres full-text search with lexical reranking and exact subpage citation links.

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

- Writes to documents, chunks, and ingestion logs use the service role after an owner/admin check; workspace members can read via RLS.
- Retrieved text and web pages are treated as data: prompts label them as reference material, never instructions.
- Web pages, sitemaps, and discovered subpages must be public HTTPS URLs (same SSRF & anti-phishing guard on every redirect hop and discovered link, with hard caps on page size, ZIP expansion, and crawl count).
- Original files are only reachable through 60-second signed URLs.
