# Alisons Studio — future-state UI model

**This is not the production messenger.**

The dogfood product is the repo root: Vite + tRPC + Hono + Socket.IO + MySQL,
`src/pages/Chat.tsx`, `api/`. Do not merge this directory over that stack.

This folder is the **object model** built in Grok App Builder: one room, people,
a call, Alice as a guest, plus a living spec. It exists so the iPhone chrome
can be designed without waiting for MLS.

Live: https://ivory-oasis-orchid-urban.grok.me/

## What is in here

| Path | What |
|---|---|
| `src/components/product/messenger.tsx` | The room: inbox, thread, composer, inspector, overlays |
| `src/lib/store.ts` | Zustand + localStorage. Simulated replies. Not a backend. |
| `src/data/` | Features, surfaces, gaps, stories, feasibility, documents — scored against the Alice Chains tree |
| `src/routes/spec.$section.tsx` | Internal spec at `/spec/features` |
| `src/styles.css` | Alisons tokens: near-black, Newsreader display, IBM Plex, one steel accent |
| `public/` | Mark as favicon, share card |

Auth, realtime, and persistence here are **demo only**. Sending a message does
not hit `api/`. Treat this as a clickable spec.

## How it relates to Track A

Keep Chat.tsx as the dogfood. Split it (GOD card) using this chrome as the
target shape: inbox | thread | inspector, overlays for search, people, files,
call, Alice terms. When the object feels finished, port the chrome onto the
real wire — do not port the wire into this folder.

## How it was recovered

On 2026-09-16 a 2 MB Grok workspace zip (`latestbuilds.zip`) was uploaded to
`main`. That zip mixed product source with platform files (`.grok/`, `.vercel/`,
build output). This directory is the product source extracted from that zip.
The zip itself is removed from the tree and gitignored.
