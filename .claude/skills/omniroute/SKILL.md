---
name: omniroute
description: Use OmniRoute, a self-hosted AI gateway that puts one OpenAI-compatible endpoint (default http://localhost:20128/v1) in front of many LLM providers, with automatic fallback and model "combos". Use when the user mentions OmniRoute, wants to route LLM calls through it, call a model via it, list its models, wire an app in this repo to it, run Claude Code/Codex through it, or add its MCP server.
---

# OmniRoute

OmniRoute (MIT, https://github.com/diegosouzapw/OmniRoute) is a self-hosted AI
gateway. Clients talk to **one OpenAI-compatible API**. OmniRoute forwards each
request to a connected provider and falls back to the next one when a provider
fails or hits its quota.

## Quick facts

| Item | Value |
|---|---|
| Default port | `20128` |
| API base URL | `http://localhost:20128/v1` |
| Dashboard | `http://localhost:20128` (providers, keys, combos, usage) |
| Auth | `Authorization: Bearer <OMNIROUTE_API_KEY>` (copy the key from Dashboard → Endpoints) |
| Chat | `POST /v1/chat/completions` (OpenAI format) |
| Responses | `POST /v1/responses` |
| Models | `GET /v1/models` |
| MCP (HTTP) | `http://localhost:20128/api/mcp/stream` |
| MCP (stdio) | `omniroute --mcp` |

## Configuration convention

Never hard-code the URL or the key. Read them from the environment:

```bash
OMNIROUTE_BASE_URL=http://localhost:20128/v1
OMNIROUTE_API_KEY=...        # secret: keep it in .env, never commit it
OMNIROUTE_MODEL=auto         # default model or combo
```

Add these keys to the relevant `.env.example` (with empty values), not to `.env`.

## Installing and running

```bash
# npm (global)
npm install -g omniroute && omniroute

# headless (server only, no UI)
omniroute serve --headless

# Docker
docker run -d --name omniroute --restart unless-stopped --stop-timeout 40 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data \
  diegosouzapw/omniroute:latest
```

Then open the dashboard, connect at least one provider, and create an API key.

Health check:

```bash
curl -s "$OMNIROUTE_BASE_URL/models" -H "Authorization: Bearer $OMNIROUTE_API_KEY" | head
```

## Choosing a model

- `auto`: a built-in combo made from every connected provider. Variants:
  `auto/coding`, `auto/fast`, `auto/cheap`, `auto/smart`, `auto/offline`,
  `auto/subscription`, `auto/thrifty`.
- `provider/model`: a specific model, e.g. `openai/gpt-5.4`, `glm/glm-5.2`.
  Get the exact IDs from `GET /v1/models`; don't guess them.
- A named combo created in the dashboard: an ordered chain of models with a
  strategy (priority, round-robin, cost-optimized, least-used, …). Use its name
  as the `model`.

Providers marked "ToS: avoid" are excluded from `auto` by default. Don't turn
them on unless the user asks explicitly.

## Calling it from code

Use any OpenAI SDK and change only the base URL.

**Node / TypeScript**

```ts
import OpenAI from "openai";

const llm = new OpenAI({
  baseURL: process.env.OMNIROUTE_BASE_URL ?? "http://localhost:20128/v1",
  apiKey: process.env.OMNIROUTE_API_KEY,
});

const res = await llm.chat.completions.create({
  model: process.env.OMNIROUTE_MODEL ?? "auto",
  messages: [{ role: "user", content: "مرحبا" }],
});
console.log(res.choices[0].message.content);
```

**Python**

```python
import os
from openai import OpenAI

llm = OpenAI(base_url=os.environ["OMNIROUTE_BASE_URL"], api_key=os.environ["OMNIROUTE_API_KEY"])
res = llm.chat.completions.create(model=os.getenv("OMNIROUTE_MODEL", "auto"),
                                  messages=[{"role": "user", "content": "Hello"}])
print(res.choices[0].message.content)
```

**curl**

```bash
curl -s "$OMNIROUTE_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"ping"}]}'
```

Streaming works the usual OpenAI way (`stream: true`).

## Using it with coding CLIs

These run on the user's own machine, where OmniRoute is installed:

```bash
omniroute configure claude      # or: omniroute run claude --model openai/gpt-5.4
omniroute configure codex       # or: omniroute run codex --model glm/glm-5.2
```

## Adding the MCP server to Claude Code

```bash
claude mcp add --transport http omniroute http://localhost:20128/api/mcp/stream
```

## Integrating into this repository

Before you change code, load the `codex-projects` skill to find the right
product (MASAR 34 `apps/`, `iso-platform/`, `alnadeg-procurement/`) and its
conventions. Then:

1. Put a single LLM client module in that product's server/lib layer, built as
   shown above.
2. Add the `OMNIROUTE_*` variables to its `.env.example`, and to `render.yaml`
   / `docker-compose.yml` if that product is deployed with them (with `sync: false`
   for the key).
3. Handle failures: set a timeout, and return a clear error when OmniRoute is
   unreachable. OmniRoute handles provider fallback itself, so don't add a
   second retry loop across providers.
4. Never log prompts that contain personal data, or the API key.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ECONNREFUSED :20128` | OmniRoute isn't running, or the URL points to the wrong host (inside Docker, use the service name, not `localhost`) |
| `401` | Wrong or missing key; create one in Dashboard → Endpoints |
| `model not found` | The ID isn't in `GET /v1/models`, or that provider isn't connected |
| Every request fails over | All providers in the combo are out of quota; see the dashboard's usage page |

## Limitations

- OmniRoute's documented API is OpenAI format. The README doesn't document an
  Anthropic `/v1/messages` endpoint, so use the OpenAI SDK.
- Free-tier quotas and terms change often. Check the dashboard, not numbers
  from the README.
- A cloud session (such as Claude Code on the web) can't reach `localhost` on the
  user's machine. OmniRoute must be deployed at a reachable URL, and that host must
  be allowed in the environment's network policy.
