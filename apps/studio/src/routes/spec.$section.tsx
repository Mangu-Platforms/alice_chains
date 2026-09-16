import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { StatusChip } from "@/components/chip";
import { FEATURES } from "@/data/features";
import { SURFACES } from "@/data/surfaces";
import { DOCUMENTS } from "@/data/documents";
import { FEASIBILITY, SCORES } from "@/data/feasibility";
import { STORIES } from "@/data/stories";
import { BLOCKERS, BUILDS, FIXES, OPPORTUNITIES, STRATEGIES } from "@/data/gaps";
import { STATUS_LABEL, type ShipStatus } from "@/data/status";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "pages", label: "Pages" },
  { id: "build", label: "Build" },
  { id: "feasibility", label: "Feasibility" },
  { id: "documents", label: "Documents" },
  { id: "stories", label: "Stories" },
  { id: "roadmap", label: "Roadmap" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/spec/$section")({
  beforeLoad: ({ params }) => {
    if (!SECTIONS.some((s) => s.id === params.section)) {
      throw redirect({ to: "/spec/$section", params: { section: "features" } });
    }
  },
  component: Spec,
});

function Spec() {
  const { section } = Route.useParams();
  const id = section as SectionId;

  return (
    <Shell>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 md:flex-row md:py-12">
        <nav className="md:w-44 md:shrink-0">
          <p className="mb-3 text-xs tracking-[0.18em] text-subtle">SPEC</p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <Link
                  to="/spec/$section"
                  params={{ section: s.id }}
                  className={cn(
                    "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm",
                    s.id === id ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 flex-1 pb-16">
          {id === "features" ? <Features /> : null}
          {id === "pages" ? <Pages /> : null}
          {id === "build" ? <Build /> : null}
          {id === "feasibility" ? <Feasibility /> : null}
          {id === "documents" ? <Docs /> : null}
          {id === "stories" ? <Stories /> : null}
          {id === "roadmap" ? <Roadmap /> : null}
        </article>
      </div>
    </Shell>
  );
}

function Features() {
  const groups: ShipStatus[] = ["shipped", "stub", "hygiene", "specified", "parked", "missing"];
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Features</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        The complete capability list for Alisons, scored against the Alice Chains repository — not
        the brochure.
      </p>
      {groups.map((g) => {
        const rows = FEATURES.filter((f) => f.status === g);
        if (!rows.length) return null;
        return (
          <section key={g} className="mt-10">
            <h2 className="text-xs font-medium tracking-[0.18em] text-subtle">
              {STATUS_LABEL[g].toUpperCase()} · {rows.length}
            </h2>
            <ul className="mt-4 divide-y divide-border">
              {rows.map((f) => (
                <li key={f.id} className="py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{f.name}</p>
                    <span className="font-mono text-[11px] text-subtle">{f.id}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{f.story}</p>
                  <p className="mt-1 text-xs text-subtle">{f.note}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Pages() {
  const kinds = ["page", "subpage", "tab", "drawer", "dialog", "menu", "overlay", "banner", "tool"] as const;
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Pages, subpages, popups</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Every surface that exists, is stubbed, or is owed. Today the running app has four routes.
        The future-state room adds the rest as overlays of one object.
      </p>
      {kinds.map((k) => {
        const rows = SURFACES.filter((s) => s.kind === k);
        if (!rows.length) return null;
        return (
          <section key={k} className="mt-10">
            <h2 className="text-xs font-medium tracking-[0.18em] text-subtle">{k.toUpperCase()}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-subtle">
                  <tr>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Path</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.path}>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted">{s.purpose}</p>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-subtle">{s.path}</td>
                      <td className="py-3">
                        <StatusChip status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Build() {
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Technical build-out</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        How each window is built today, and what it must become. Citations are to the Alice Chains
        tree, not this preview.
      </p>
      <ol className="mt-8 space-y-4">
        {SURFACES.map((s, i) => (
          <li key={s.path} className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tabular-nums text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <h2 className="text-base font-medium">{s.name}</h2>
              <StatusChip status={s.status} />
            </div>
            <p className="mt-2 font-mono text-xs text-subtle">{s.path}{s.parent ? ` · parent ${s.parent}` : ""}</p>
            <p className="mt-3 text-sm text-muted">{s.purpose}</p>
            <p className="mt-2 text-sm text-foreground">{s.build}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Feasibility() {
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Feasibility</h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">{FEASIBILITY.verdict}</p>
      <div className="mt-10 space-y-3">
        {SCORES.map((s) => (
          <div key={s.area}>
            <div className="mb-1 flex justify-between text-xs">
              <span>{s.area}</span>
              <span className="tabular-nums text-muted">
                now {s.now}/10 · enterprise {s.enterprise}/10
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-accent"
                style={{ width: `${s.now * 10}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-subtle">{s.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {FEASIBILITY.tracks.map((t) => (
          <div key={t.name} className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <p className="text-xs tracking-[0.16em] text-subtle">{t.feasible.toUpperCase()}</p>
            <p className="mt-2 font-display text-2xl tracking-tight">{t.name}</p>
            <p className="mt-3 text-sm text-muted">{t.window}</p>
            <p className="mt-2 text-sm text-muted">{t.cost}</p>
            <p className="mt-2 text-xs text-subtle">{t.risk}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-12 font-display text-2xl tracking-tight">Go</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
        {FEASIBILITY.go.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <h2 className="mt-10 font-display text-2xl tracking-tight">No</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
        {FEASIBILITY.noGo.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </div>
  );
}

function Docs() {
  const phases = [...new Set(DOCUMENTS.map((d) => d.phase))];
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Documents to procure</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Chronological. Engineering artefacts already in the repo are marked. Legal, brand, and
        operations are mostly absent. Enterprise future-state does not begin at a Dockerfile.
      </p>
      {phases.map((p) => (
        <section key={p} className="mt-10">
          <h2 className="text-xs font-medium tracking-[0.18em] text-subtle">{p.toUpperCase()}</h2>
          <ol className="mt-4 space-y-3">
            {DOCUMENTS.filter((d) => d.phase === p).map((d) => (
              <li key={d.order} className="flex gap-4">
                <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-subtle">
                  {String(d.order).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {d.name}{" "}
                    <span
                      className={cn(
                        "text-xs font-normal",
                        d.have === "in-repo" ? "text-ok" : d.have === "stale" ? "text-warn" : "text-bad",
                      )}
                    >
                      {d.have === "in-repo" ? "in repo" : d.have === "stale" ? "stale" : "procure"}
                    </span>
                  </p>
                  <p className="text-xs text-muted">{d.why}</p>
                  {d.source ? <p className="font-mono text-[11px] text-subtle">{d.source}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Stories() {
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">User stories</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        As a person, I want a room I would actually use. Status is against the running repository.
      </p>
      <ul className="mt-8 divide-y divide-border">
        {STORIES.map((s) => (
          <li key={s.id} className="py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-xs text-subtle">{s.id}</p>
              <span
                className={cn(
                  "text-xs",
                  s.status === "met" ? "text-ok" : s.status === "partial" ? "text-warn" : "text-bad",
                )}
              >
                {s.status}
              </span>
            </div>
            <p className="mt-1 text-sm">
              As a <span className="text-accent">{s.persona}</span>, I want to {s.want} so that {s.so}.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Roadmap() {
  const blocks = [
    { title: "Fixes", items: FIXES },
    { title: "Blockers", items: BLOCKERS },
    { title: "Opportunities", items: OPPORTUNITIES },
    { title: "Strategies", items: STRATEGIES },
    { title: "Build recommendations", items: BUILDS },
  ];
  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight">Fixes, blockers, strategy</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Nonstop inventory. Work top to bottom. Do not start Track B to avoid finishing Track A.
      </p>
      {blocks.map((b) => (
        <section key={b.title} className="mt-10">
          <h2 className="font-display text-2xl tracking-tight">{b.title}</h2>
          <ul className="mt-4 space-y-4">
            {b.items.map((it) => (
              <li key={it.id}>
                <p className="text-sm font-medium">
                  <span className="font-mono text-xs text-subtle">{it.id}</span> {it.title}
                </p>
                <p className="mt-1 text-sm text-muted">{it.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
