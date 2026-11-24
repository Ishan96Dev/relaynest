# Workflow Engine Specification

## 1. Purpose

The workflow engine executes deterministic automation graphs. It is
independent of Telegram so additional trigger and output adapters can be
introduced later.

## 2. Workflow graph model

A workflow contains: - Nodes. - Edges. - Trigger definition. - Node
configuration. - Version. - Status.

Example:

``` json
{
  "version": 1,
  "nodes": [
    {
      "id": "trigger_1",
      "type": "trigger.webhook",
      "position": { "x": 100, "y": 100 },
      "config": {}
    },
    {
      "id": "condition_1",
      "type": "condition.equals",
      "position": { "x": 400, "y": 100 },
      "config": {
        "field": "event.status",
        "value": "success"
      }
    },
    {
      "id": "action_1",
      "type": "action.telegram.sendMessage",
      "position": { "x": 700, "y": 100 },
      "config": {
        "botId": "bot-id",
        "chatIdSource": "configured",
        "text": "Deployment completed."
      }
    }
  ],
  "edges": [
    { "id": "edge_1", "source": "trigger_1", "target": "condition_1" },
    {
      "id": "edge_2",
      "source": "condition_1",
      "target": "action_1",
      "sourceHandle": "true"
    }
  ]
}
```

This is a conceptual format. Define and version a formal Zod schema
before persisting production graphs.

## 3. Node categories

### Triggers

- `trigger.telegram.message`
- `trigger.webhook`
- `trigger.schedule`

### Conditions

- `condition.equals`
- `condition.notEquals`
- `condition.contains`
- `condition.isEmpty`
- `condition.httpStatus`

### Actions

- `action.telegram.sendMessage`
- `action.http.request`
- `action.database.insert` (only into a controlled application data
  model; no arbitrary SQL)

## 4. Validation

Before activation: - Exactly one entry trigger unless multi-trigger
workflows are explicitly supported. - All node types are recognized. -
Every node config validates against its schema. - All edge endpoints
exist. - No invalid edge types. - No unsupported cycles. - All reachable
action nodes have a valid path from a trigger. - Required integrations
are connected. - Workspace owns every referenced bot/integration. -
Limits on nodes and graph size are respected.

## 5. Execution model

1.  Receive normalized trigger event.
2.  Resolve active workflow version.
3.  Create execution record.
4.  Traverse graph in deterministic order.
5.  Execute condition nodes and select outgoing path.
6.  Execute action nodes.
7.  Persist step outcome.
8.  Finish execution as succeeded, failed, or cancelled.

## 6. Execution statuses

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Step statuses: - `pending` - `running` - `succeeded` - `failed` -
`skipped`

## 7. Safety limits

Set configurable limits: - Maximum nodes per workflow. - Maximum
execution duration. - Maximum actions per execution. - Maximum outbound
request size. - Maximum retry attempts. - Maximum concurrent executions
per workspace. - Maximum webhook payload size.

## 8. HTTP request action safety

The HTTP action can create SSRF risk. Implement: - HTTPS-only by
default. - Block loopback, link-local, private, and cloud metadata IP
ranges. - Re-check DNS resolution and redirects. - Restrict ports. -
Limit response size and duration. - Do not forward internal
credentials. - Apply workspace rate limits. - Consider an explicit
destination allowlist.

## 9. Retry and idempotency

- Retry transient network failures only.
- Respect provider retry-after responses.
- Use bounded exponential backoff with jitter.
- Do not retry validation or authorization failures.
- Store idempotency keys for side-effecting actions.
- Make retry attempts visible in execution history.

## 10. Versioning

Published workflow versions should be immutable. Editing a workflow
creates a new draft/version. An execution records the exact workflow
version it used.

## 11. Future extension

Potential future nodes: - Discord output. - Email output. - Slack
output. - WhatsApp output. - AI model call (Coming Soon; not MVP). -
Milvus retrieval (Coming Soon; not MVP).
