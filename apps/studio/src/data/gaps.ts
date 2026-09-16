export type Item = {
  id: string;
  title: string;
  detail: string;
};

export const FIXES: Item[] = [
  {
    id: "H-9",
    title: "Paginate history past 50 messages",
    detail: "The API already takes limit/offset. The client never moves. Jump-to-message lies when the hit is older than the window.",
  },
  {
    id: "S-20a",
    title: "Finish the message catalogue",
    detail: "Screen-reader strings moved. Visible Chat and Contacts copy is still inline English.",
  },
  {
    id: "S-12b",
    title: "Make validate a required check on main",
    detail: "A red build can still merge. This is a GitHub setting, not a commit.",
  },
  {
    id: "S-12a",
    title: "Publish coverage",
    detail: "Needs @vitest/coverage-v8 and a lockfile change. Waiting on an explicit maintainer yes.",
  },
  {
    id: "H-7",
    title: "Rename misleading env keys",
    detail: "VITE_KIMI_AUTH_URL is server-only. JWT_SECRET is an HMAC cookie. Names lie.",
  },
  {
    id: "STATUS",
    title: "Rewrite CURRENT_STATUS.md",
    detail: "The Aug 12 body still describes a broken clone. Waves 0–4 are done. Newcomers will trust the wrong document.",
  },
  {
    id: "GOD",
    title: "Split Chat.tsx",
    detail: "81 KB in one file. Composer, thread, sidebar, group dialog, search, media must become modules before calls or E2EE land in it.",
  },
  {
    id: "ADMIN-UI",
    title: "Give S-18 a screen",
    detail: "Owner can list, deactivate, export, erase — only over tRPC. No /admin.",
  },
  {
    id: "P-TOOL-10",
    title: "CONTRIBUTING.md",
    detail: "CLAUDE.md is the working agreement. Humans still need a door.",
  },
  {
    id: "P-TOOL-6",
    title: "Walk SETUP.md as a stranger",
    detail: "The last unproven operator path. If it fails, the product is not self-hostable.",
  },
];

export const BLOCKERS: Item[] = [
  {
    id: "B-IDP",
    title: "Single identity provider",
    detail: "Kimi OAuth is the only door. Enterprise buyers need OIDC/SAML. Consumers need passkeys. Neither exists.",
  },
  {
    id: "B-TURN",
    title: "No STUN/TURN estate",
    detail: "Calls cannot ship without a media relay. Coturn or a paid TURN. Not a weekend stub.",
  },
  {
    id: "B-CRYPTO",
    title: "E2EE is a re-architecture",
    detail: "Bolting Signal onto MySQL plaintext is throwaway. MLS needs a Rust core, device keys, and an event log. Track B is parked for this reason.",
  },
  {
    id: "B-SCALE",
    title: "Presence is in-process",
    detail: "Two Node instances split the truth. Redis adapter is gated, not built.",
  },
  {
    id: "B-LEGAL",
    title: "Zero product legal",
    detail: "MIT code license is not a privacy policy, DPA, or VDP. You cannot ship to the EU or an enterprise without them.",
  },
  {
    id: "B-NAME",
    title: "Alisons is not registered here",
    detail: "The repo, cookies, sessions, and docs still say Alice Chains. Trademark, domains, and cookie names must move together.",
  },
  {
    id: "B-STORE",
    title: "Object storage for production attachments",
    detail: "Filesystem driver is fine locally. Production needs S3/R2 credentials and a CORS bucket.",
  },
  {
    id: "B-MEASURE",
    title: "No performance numbers",
    detail: "PRD targets <100ms P99 delivery. Current state: unmeasured. You cannot claim what you have not timed.",
  },
];

export const OPPORTUNITIES: Item[] = [
  {
    id: "O-OBJECT",
    title: "One object, not a Slack clone",
    detail: "The iPhone of rooms. Four pages today. The winning product is a single surface: room, people, call, memory, a visible AI — not a left-nav of apps.",
  },
  {
    id: "O-PRIVATE",
    title: "Privacy as the brand",
    detail: "Mattermost looks like 2014. Signal has no teams. Slack cannot self-host. The empty cell is beautiful and private.",
  },
  {
    id: "O-ALICE",
    title: "Alice as a guest, never a spy",
    detail: "Admit an AI into a room the way you admit a person. Disclose retention. Remove her like a member. That is the company.",
  },
  {
    id: "O-SELFHOST",
    title: "docker compose up as the sales motion",
    detail: "If a founder can run Alisons in five minutes, you beat Mattermost on feeling and Slack on sovereignty.",
  },
  {
    id: "O-RENAME",
    title: "Alisons is a better name than Alice Chains",
    detail: "Chains sounds like crypto theatre. Alisons sounds like a person. Keep Alice as the AI guest. Rename the product.",
  },
  {
    id: "O-WEB-FIRST",
    title: "Ship the web object before native",
    detail: "PWA + excellent desktop web beats a thin React Native wrap. Native after the protocol core exists.",
  },
];

export const STRATEGIES: Item[] = [
  {
    id: "S1",
    title: "Stabilize the prototype. Do not rewrite it yet.",
    detail: "Waves 0–4 are done. Finish hygiene. Daily-drive it with ten people. The current stack is the learning vehicle.",
  },
  {
    id: "S2",
    title: "Split the god component before adding gravity.",
    detail: "Calls, E2EE, and Alice cannot land in an 81k file. Extract thread, composer, sidebar, inspectors.",
  },
  {
    id: "S3",
    title: "Build the iPhone chrome on this stack, protocol later.",
    detail: "Future-state UI (this model) can ship as the product shell while Track B replaces the wire. Do not wait for MLS to make it feel finished.",
  },
  {
    id: "S4",
    title: "When E2EE starts, start MLS — not Signal-on-MySQL.",
    detail: "The parked program is the honest one. Gate B is cryptographic proof with two clients, not a library import.",
  },
  {
    id: "S5",
    title: "Enterprise is a mode, not the first user.",
    detail: "First market: trusted groups. MANAGED mode (legal hold, SSO) comes after PRIVATE works. Do not let procurement write the MVP.",
  },
  {
    id: "S6",
    title: "Rename in one cut.",
    detail: "Alisons everywhere: cookie, session, docs, package, mark. Half-renames rot trust.",
  },
];

export const BUILDS: Item[] = [
  {
    id: "R1",
    title: "Next 14 days",
    detail: "H-9 pagination. Split Chat.tsx. Admin page. CURRENT_STATUS rewrite. Brand pass to Alisons. Walk SETUP.md as a stranger.",
  },
  {
    id: "R2",
    title: "Next 60 days — M5 calls beta",
    detail: "WebRTC signaling over existing sockets. Coturn in compose. Call overlay. Voice notes. Do not start E2EE in this window.",
  },
  {
    id: "R3",
    title: "Next 90 days — product complete on current stack",
    detail: "Onboarding. Invite links. Delete-account. Member export. Notification center. Public legal drafts. Ten-person dogfood.",
  },
  {
    id: "R4",
    title: "Then — open Track B",
    detail: "Rust protocol core, MLS vectors, device linking. Only after real usage. Otherwise you will encrypt a product nobody opens.",
  },
];
