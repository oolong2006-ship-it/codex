# Ops Copilot — المستشار التشغيلي (via OmniRoute)

A control-room briefing card on the dashboard. It reads the live situation and
returns an Arabic summary plus up to five prioritised, concrete actions
("open extra lanes at Gate 6", "escalate 2 incidents past SLA", …).

`GET /api/copilot/briefing` — permission `dashboard:read`.

## The idea: severity decides the route

The LLM is reached through an [OmniRoute](https://github.com/diegosouzapw/OmniRoute)
gateway: one OpenAI-compatible `/v1/chat/completions` endpoint in front of
many providers, with fallback between them. MASAR adds one more layer on top:

| Situation (`assessSituation`) | Route | Model / combo | Timeout |
|---|---|---|---|
| `CALM`, `WATCH` | routine | `OMNIROUTE_MODEL_ROUTINE` (e.g. a free-tier combo) | 15 s |
| `ELEVATED`, `CRITICAL` | priority | `OMNIROUTE_MODEL_PRIORITY` (e.g. a fast premium combo) | 6 s |

- **Quiet hours cost nothing**: routine briefings go to a cheap/free combo.
- **Emergencies get the best model, fast**: when a zone turns critical or an
  incident breaches SLA, the briefing switches to the priority combo with a
  short timeout.
- **The card is never empty**: if the gateway is unset, errors, times out or
  replies with something that isn't the expected JSON, a deterministic
  rule-based briefing (`ruleBasedBriefing`) is returned instead.
  `source` and `fallbackReason` say which one you got.
- Briefings are cached per tenant **and** per situation level
  (`COPILOT_CACHE_TTL_MS`, default 60 s), so a level change regenerates at once.

The level rules, routing, prompt, reply validation and rule-based fallback are
pure functions in `apps/api/src/common/copilot.ts`, covered by `copilot.spec.ts`.

## Data that leaves the platform

Only zone and gate names, occupancy/queue numbers, risk levels and incident
*counts*. No incident descriptions, no user data, no free text.

## Setup

```bash
npx omniroute                  # dashboard + gateway on http://localhost:20128
```

In the OmniRoute dashboard, connect your providers and create two combos
named `masar-routine` and `masar-priority` (or point the env vars at any
model names OmniRoute accepts). Then in `.env`:

```bash
OMNIROUTE_BASE_URL=http://localhost:20128/v1          # docker compose: http://host.docker.internal:20128/v1
OMNIROUTE_API_KEY=<key from the OmniRoute dashboard, if auth is on>
```

Leave `OMNIROUTE_BASE_URL` empty to run with the rule-based briefing only.

## Response

```json
{
  "level": "ELEVATED",
  "summary": "…",
  "actions": [{ "priority": "HIGH", "target": "Gate 6", "action": "…" }],
  "source": "omniroute",
  "route": { "tier": "priority", "model": "masar-priority", "timeoutMs": 6000 },
  "servedModel": "…",
  "fallbackReason": null,
  "latencyMs": 812,
  "generatedAt": "2026-10-30T18:20:21.687Z",
  "cached": false
}
```
