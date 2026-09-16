export type Score = {
  area: string;
  now: number;
  enterprise: number;
  note: string;
};

export const SCORES: Score[] = [
  { area: "Messaging core", now: 8, enterprise: 9, note: "Real, typed, tested. Pagination is the hole." },
  { area: "Auth & identity", now: 5, enterprise: 9, note: "One OAuth. Need passkeys, OIDC, SCIM." },
  { area: "Authorization", now: 8, enterprise: 9, note: "Wave 1 closed the leaks. Admin UI missing." },
  { area: "Realtime scale", now: 3, enterprise: 8, note: "Single process. Redis gated." },
  { area: "Media / calls", now: 1, enterprise: 8, note: "Buttons. No media plane." },
  { area: "Encryption", now: 2, enterprise: 10, note: "TLS + HMAC. Server reads everything." },
  { area: "AI governance", now: 0, enterprise: 9, note: "The differentiator. Not a line of product code." },
  { area: "Native clients", now: 2, enterprise: 8, note: "Responsive web only." },
  { area: "Compliance", now: 2, enterprise: 9, note: "Docs about GDPR. No legal, no DPIA, no hold." },
  { area: "Design / object", now: 4, enterprise: 10, note: "Competent Slack-dark. Not an iPhone." },
  { area: "Documentation", now: 9, enterprise: 9, note: "Best part of the repo. Partly stale." },
  { area: "Operability", now: 6, enterprise: 9, note: "Healthz, logs, compose. No runbooks." },
];

export const FEASIBILITY = {
  verdict:
    "The current repository can become a daily-usable self-hosted messenger in weeks. It cannot become the iPhone of private rooms without a second architecture. Those are two products that share a name and a feeling — not a codebase.",
  tracks: [
    {
      name: "Track A — current stack",
      feasible: "High",
      window: "6–12 weeks to product-complete web messenger with calls beta",
      cost: "One focused engineer plus design. TURN infrastructure is the only new vendor.",
      risk: "Chat.tsx gravity. Single IdP. Unmeasured performance. Stale status docs.",
    },
    {
      name: "Track B — MLS / Alice OS",
      feasible: "Medium, capital-intensive",
      window: "9–18 months to private beta of encrypted multi-device with visible AI",
      cost: "Protocol engineer, two client engineers, applied cryptographer (review), TURN, object storage, AI spend controls.",
      risk: "Rewriting before users. Web-client assurance limits. Archive-vs-forward-secrecy tension. Enterprise legal hold vs PRIVATE mode.",
    },
  ],
  go: [
    "Keep Track A alive as the dogfood and the UI shell.",
    "Do not encrypt MySQL plaintext and call it E2EE.",
    "Do not start native apps until the protocol core exists.",
    "Do not sell MANAGED (SSO, hold, DLP) as the first SKU.",
    "Rename to Alisons in one cut when Track A feels finished enough to show.",
  ],
  noGo: [
    "A 14-month rewrite with no daily users.",
    "Signal Protocol bolted onto the prototype.",
    "Hidden server-side AI over private rooms.",
    "Claiming <100ms P99 or GDPR-ready without evidence.",
  ],
};
