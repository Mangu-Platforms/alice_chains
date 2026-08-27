# Pages, subpages, popups, tools

Information architecture of Alisons. **Today the running product has four routes.** Everything else is specified, stubbed, parked, or missing.

## Pages (shipped)

| Name | Path | Purpose | Build |
|---|---|---|---|
| Login | `/login` | Kimi OAuth. No password, no passkey | `Login.tsx` |
| Chat | `/` | Conversation list + thread + composer | `Chat.tsx` ~81k god component |
| Contacts | `/contacts` | People graph | `Contacts.tsx` lazy |
| Settings | `/settings` | Picture, name, status, sign out everywhere | `Settings.tsx` one page |
| Not found | `*` | Unknown routes | `NotFound.tsx` |

## Chat sub-surfaces (shipped)

| Name | Kind | Purpose |
|---|---|---|
| Conversation list | subpage | Recency, avatar, preview, unread, presence. Overlay below 768px |
| Thread pane | subpage | Bubbles, ticks, edits, deletes, replies, reactions, typing. Last 50 only |
| Composer | tool | Auto-resize, attach, emoji, send, 4000 cap |
| Chat header | tool | Name, presence, search, media, call, video, more. Calls are stubs |
| Account menu | menu | Settings, contacts, sign out |
| Conversation options | menu | Rename, members, leave, ownership, block |
| Message actions | menu | Reply, edit, delete, react |
| Emoji picker | overlay | Composer insert or reaction |
| In-conversation search | overlay | Hits outside 50-window show a notice |
| Global search | overlay | Every conversation the caller belongs to |
| Media drawer | drawer | Photos/files + download |
| Connection banner | banner | Socket down; sends queued |
| Group management dialog | dialog | Rename, members, leave, transfer |
| Attachment preview | overlay | Image or download |
| Auth skeleton | overlay | Hold layout while `auth.me` resolves |

## Contacts (shipped)

| Name | Kind | Path |
|---|---|---|
| My Contacts | tab | `/contacts?tab=contacts` |
| Pending requests | tab | `/contacts?tab=pending` |
| Add Contact | dialog | `/contacts · add` |

## Settings (shipped)

| Name | Kind | Path |
|---|---|---|
| Picture | subpage | `/settings#picture` |
| Profile fields | subpage | `/settings#profile` |
| Security | subpage | `/settings#security` — revoke all sessions, no device list |
| Account | subpage | `/settings#account` — email only, no delete |

## Stubs

| Name | Kind | Status | Note |
|---|---|---|---|
| Voice call | overlay | stub | Button only. No overlay, no WebRTC |
| Video call | overlay | stub | Button only |

## Missing / parked pages

| Name | Path | Status | Purpose |
|---|---|---|---|
| Admin console | `/admin` | missing | Member list, deactivation, audit, export, erasure. API exists |
| Onboarding | `/welcome` | missing | First private conversation in ten minutes |
| Devices | `/settings/devices` | parked | Linked devices, verification phrase, revoke |
| Security dashboard | `/settings/security` | parked | Safety numbers, mode, Alice access |
| Alice admission | `/ · admit Alice` | parked | Disclose provider, retention, consent |
| Notification center | `/inbox` | missing | Missed calls, device events, requests |
| Call history | `/calls` | specified | Past voice/video. No schema |
| Workspace | `/org` | missing | Tenant, SSO, retention, billing |
| Data export | `/settings/export` | specified | GDPR portability. Admin API only |
| Account deletion | `/settings/delete` | specified | Right to erasure. Not a button |
| Invite landing | `/i/:code` | missing | Join group from a link |
| Legal | `/legal` | missing | Privacy, terms, AUP, DPA, subprocessors |

## Operator tools

| Name | Path | Status |
|---|---|---|
| Dev seed | `npm run db:seed` | shipped |
| Dev bootstrap | `./scripts/dev.sh` | shipped |
| Reset-dev | `scripts/reset-dev.sh` | hygiene — not started |
| Drizzle Studio | `npm run db:studio` | shipped |
| VAPID generator | `npm run generate-vapid` | shipped |
