# Alisons white paper

**The repo is a messenger. The product is a room.**

Alice Chains does not do the vision justice. It is the best-documented prototype in the building — and still four pages away from an object you would bet a company on. This is not a music app. It is a private communications OS. The new name is Alisons.

## Verdict

The documentation sees the full picture. The software does not.

Waves 0–4 of the build plan are in the tree: real-time chat, groups, contacts, blocking, attachments, reactions, search, push, sessions with PKCE. That is a Phase 2 messenger.

Voice and video are icons. The server can read every word. There is no device identity, no passkey, no Alice, no legal page, no admin screen. `src/pages/Chat.tsx` is ~81 KB. History stops at fifty messages.

The iPhone was not a better phone. It was one object. Alisons has to be one room — people, memory, a call, a visible AI — not a left-nav of features.

Keep the current stack as the dogfood. Do not bolt encryption onto MySQL. When you encrypt, you rebuild the wire. Until then, finish the object.

## The two tracks

### Track A — current stack

Daily-usable web messenger. Split the god file. Paginate. Calls beta. Rename. Ten people in a room.

Feasible in 6–12 weeks with one focused engineer plus design. TURN is the only new vendor.

### Track B — the OS

MLS, devices, local search, Alice as a guest. Nine to eighteen months. Open it after people already live here.

Do not start this as a 14-month rewrite with no daily users.

## What the repo actually is

| Layer | Reality |
|---|---|
| Product | Self-hosted web messenger with Kimi OAuth |
| Pages | Login, Chat, Contacts, Settings, Not found |
| Realtime | Socket.IO, in-process presence |
| Persist | MySQL + Drizzle, filesystem attachments (S3 optional) |
| Search | MySQL FULLTEXT, not Meilisearch |
| Calls | Header icons. No WebRTC. |
| E2EE | Parked. Server reads plaintext. |
| Alice | Name in docs. Zero product UI. |

## Rename rule

One cut. Cookie, session, package, docs, mark, domains. Half-renames rot trust. Keep **Alice** as the guest AI. Call the product **Alisons**.
