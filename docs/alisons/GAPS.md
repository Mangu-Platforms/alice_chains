# Fixes, blockers, opportunities, strategy

## Hygiene (do these)

| ID | Title | Detail |
|---|---|---|
| H-9 | Paginate history past 50 | API has limit/offset. Client never moves |
| GOD | Split Chat.tsx | 81 KB. Extract before calls/E2EE |
| ADMIN-UI | Give S-18 a screen | tRPC exists. No `/admin` |
| STATUS | Rewrite CURRENT_STATUS.md | Aug 12 body still describes a broken clone |
| S-20a | Finish the message catalogue | Visible Chat/Contacts copy still inline English |
| S-12b | Make validate required on main | A red build can still merge |
| H-7 | Rename misleading env keys | `VITE_KIMI_AUTH_URL` is server-only; `JWT_SECRET` is HMAC |
| P-TOOL-10 | CONTRIBUTING.md | ✅ Done — plus `AGENTS.md` for agents and `docs/README.md` as the index |
| P-TOOL-6 | Walk SETUP.md as a stranger | If it fails, not self-hostable |

## Blockers

| ID | Title | Detail |
|---|---|---|
| B-IDP | Single identity provider | Kimi only. Need OIDC/SAML and passkeys |
| B-TURN | No STUN/TURN estate | Calls cannot ship without a media relay |
| B-CRYPTO | E2EE is a re-architecture | MLS needs a core, device keys, event log |
| B-SCALE | Presence is in-process | Two Node instances split the truth |
| B-LEGAL | Zero product legal | MIT is not a privacy policy |
| B-NAME | Alisons is not registered here | Repo, cookies, docs still say Alice Chains |
| B-STORE | Object storage for production | Filesystem is local-only |
| B-MEASURE | No performance numbers | Cannot claim <100ms P99 |

## Opportunities

| ID | Title |
|---|---|
| O-OBJECT | One object, not a Slack clone |
| O-PRIVATE | Privacy as the brand — empty cell between Signal and Slack |
| O-ALICE | Alice as a guest, never a spy |
| O-SELFHOST | `docker compose up` as the sales motion |
| O-RENAME | Alisons is a person; Chains sounds like theatre |
| O-WEB-FIRST | Ship the web object before native |

## Strategies

1. Stabilize the prototype. Do not rewrite it yet.
2. Split the god component before adding gravity.
3. Build the iPhone chrome on this stack; protocol later.
4. When E2EE starts, start MLS — not Signal-on-MySQL.
5. Enterprise is a mode, not the first user.
6. Rename in one cut.

## Build recommendations

| Window | Work |
|---|---|
| Next 14 days | H-9 pagination. Split Chat.tsx. Admin page. CURRENT_STATUS rewrite. Brand pass. Walk SETUP.md |
| Next 60 days | WebRTC signaling, Coturn, call overlay, voice notes. No E2EE in this window |
| Next 90 days | Onboarding, invite links, delete-account, member export, notification center, legal drafts, ten-person dogfood |
| Then | Open Track B. Rust protocol core, MLS vectors, device linking — only after real usage |
