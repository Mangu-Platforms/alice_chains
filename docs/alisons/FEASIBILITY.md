# Feasibility study

The current repository can become a daily-usable self-hosted messenger in weeks. It cannot become the iPhone of private rooms without a second architecture. Those are two products that share a name and a feeling — not a codebase.

## Scores (now → enterprise)

| Area | Now | Enterprise | Note |
|---|---|---|---|
| Messaging core | 8 | 9 | Real, typed, tested. Pagination is the hole |
| Auth & identity | 5 | 9 | One OAuth. Need passkeys, OIDC, SCIM |
| Authorization | 8 | 9 | Wave 1 closed leaks. Admin UI missing |
| Realtime scale | 3 | 8 | Single process. Redis gated |
| Media / calls | 1 | 8 | Buttons. No media plane |
| Encryption | 2 | 10 | TLS + HMAC. Server reads everything |
| AI governance | 0 | 9 | Differentiator. Not a line of product code |
| Native clients | 2 | 8 | Responsive web only |
| Compliance | 2 | 9 | Docs about GDPR. No legal, no DPIA, no hold |
| Design / object | 4 | 10 | Competent Slack-dark. Not an iPhone |
| Documentation | 9 | 9 | Best part of the repo. Partly stale |
| Operability | 6 | 9 | Healthz, logs, compose. No runbooks |

## Track A — current stack

- Feasible: **High**
- Window: 6–12 weeks to product-complete web messenger with calls beta
- Cost: one focused engineer plus design. TURN is the only new vendor
- Risk: Chat.tsx gravity. Single IdP. Unmeasured performance. Stale status docs

## Track B — MLS / Alice OS

- Feasible: **Medium, capital-intensive**
- Window: 9–18 months to private beta of encrypted multi-device with visible AI
- Cost: protocol engineer, two client engineers, applied cryptographer (review), TURN, object storage, AI spend controls
- Risk: rewriting before users; web-client assurance; archive vs forward secrecy; legal hold vs PRIVATE mode

## Go

- Keep Track A alive as the dogfood and the UI shell
- Do not encrypt MySQL plaintext and call it E2EE
- Do not start native apps until the protocol core exists
- Do not sell MANAGED (SSO, hold, DLP) as the first SKU
- Rename to Alisons in one cut when Track A feels finished enough to show

## No-go

- A 14-month rewrite with no daily users
- Signal Protocol bolted onto the prototype
- Hidden server-side AI over private rooms
- Claiming <100ms P99 or GDPR-ready without evidence
