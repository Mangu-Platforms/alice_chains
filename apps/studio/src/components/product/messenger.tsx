import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Phone,
  Search,
  Settings,
  Shield,
  Users,
  Video,
  X,
} from "lucide-react";
import { PEOPLE, person, type Msg } from "@/data/demo";
import { useMessenger, type Overlay } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Mark } from "@/components/mark";

export function Messenger() {
  const roomId = useMessenger((s) => s.roomId);
  const rooms = useMessenger((s) => s.rooms);
  const mobile = useMessenger((s) => s.mobile);
  const overlay = useMessenger((s) => s.overlay);
  const hydrate = useMessenger((s) => s.hydrate);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="relative flex h-dvh min-h-0 bg-background">
      <aside
        className={cn(
          "w-full shrink-0 flex-col border-r border-border bg-card md:flex md:w-80",
          mobile === "list" ? "flex" : "hidden md:flex",
        )}
      >
        <Inbox />
      </aside>
      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          mobile === "thread" ? "flex" : "hidden md:flex",
        )}
      >
        <ThreadHeader />
        <Thread />
        <Composer />
      </section>
      <Inspector className="hidden lg:flex" />
      {overlay ? <OverlayPane overlay={overlay} roomName={room.name} /> : null}
    </div>
  );
}

function Inbox() {
  const roomId = useMessenger((s) => s.roomId);
  const rooms = useMessenger((s) => s.rooms);
  const setRoom = useMessenger((s) => s.setRoom);
  const setOverlay = useMessenger((s) => s.setOverlay);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <Mark className="size-5" />
          <p className="font-display text-2xl tracking-tight">Alisons</p>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="New conversation"
            onClick={() => setOverlay("contacts")}
            className="grid size-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-foreground"
          >
            <Users className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Open settings"
            onClick={() => setOverlay("settings")}
            className="grid size-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-foreground"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {rooms.map((r) => {
          const active = r.id === roomId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setRoom(r.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left",
                  active ? "bg-raised" : "hover:bg-raised/60",
                )}
              >
                <Avatar initials={r.name.slice(0, 2).toUpperCase()} alice={r.alice} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-subtle">{r.time}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{r.preview}</span>
                </span>
                {r.unread > 0 ? (
                  <span className="mt-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground tabular-nums">
                    {r.unread}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ThreadHeader() {
  const rooms = useMessenger((s) => s.rooms);
  const roomId = useMessenger((s) => s.roomId);
  const setMobile = useMessenger((s) => s.setMobile);
  const setOverlay = useMessenger((s) => s.setOverlay);
  const startCall = useMessenger((s) => s.startCall);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const online = room.members.some((id) => person(id)?.online && id !== "me");

  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-2">
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full text-muted hover:text-foreground md:hidden"
        aria-label="Back to rooms"
        onClick={() => setMobile("list")}
      >
        <ArrowLeft className="size-4" />
      </button>
      <Avatar initials={room.name.slice(0, 2).toUpperCase()} alice={room.alice} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{room.name}</p>
        <p className="truncate text-xs text-muted">
          {online ? "Active now" : "Away"}
          {room.alice ? " · Alice in the room" : ""}
        </p>
      </div>
      <IconBtn label="Search this room" onClick={() => setOverlay("search")}>
        <Search className="size-4" />
      </IconBtn>
      <IconBtn label="Files and photos" onClick={() => setOverlay("media")}>
        <ImageIcon className="size-4" />
      </IconBtn>
      <IconBtn label="Start a voice call" onClick={startCall}>
        <Phone className="size-4" />
      </IconBtn>
      <IconBtn label="People" onClick={() => setOverlay("people")} className="lg:hidden">
        <Users className="size-4" />
      </IconBtn>
    </header>
  );
}

function Thread() {
  const roomId = useMessenger((s) => s.roomId);
  const messages = useMessenger((s) => s.messages);
  const typing = useMessenger((s) => s.typing);
  const react = useMessenger((s) => s.react);
  const setReply = useMessenger((s) => s.setReply);
  const thread = messages.filter((m) => m.convId === roomId);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread.length, roomId, typing]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {thread.map((m) => (
          <Bubble key={m.id} msg={m} all={thread} onReact={() => react(m.id)} onReply={() => setReply(m.id)} />
        ))}
        {typing ? (
          <p className="px-1 text-xs text-muted">{person(typing)?.name ?? "Someone"} is writing…</p>
        ) : null}
        <div ref={end} />
      </div>
    </div>
  );
}

function Bubble({
  msg,
  all,
  onReact,
  onReply,
}: {
  msg: Msg;
  all: Msg[];
  onReact: () => void;
  onReply: () => void;
}) {
  if (msg.kind === "system") {
    return <p className="self-center text-center text-xs text-subtle">{msg.text}</p>;
  }
  const who = person(msg.authorId);
  const quoted = msg.replyTo ? all.find((x) => x.id === msg.replyTo) : undefined;
  return (
    <article className={cn("flex max-w-[85%] flex-col gap-1", msg.mine ? "self-end items-end" : "self-start")}>
      {!msg.mine ? (
        <p className="px-1 text-xs font-medium text-muted">{who?.name ?? "Unknown"}</p>
      ) : null}
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          msg.mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-raised text-foreground shadow-border",
        )}
      >
        {quoted ? (
          <p
            className={cn(
              "mb-1.5 border-l-2 pl-2 text-xs",
              msg.mine ? "border-primary-foreground/40 text-primary-foreground/70" : "border-accent text-muted",
            )}
          >
            {quoted.text}
          </p>
        ) : null}
        {msg.kind === "file" ? (
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4" />
            {msg.text}
          </span>
        ) : msg.kind === "voice" ? (
          <span className="inline-flex items-center gap-2">
            <Mic className="size-4" />
            {msg.text}
          </span>
        ) : (
          msg.text
        )}
        {msg.edited ? <span className="ml-2 text-xs opacity-60">edited</span> : null}
      </div>
      <div className="flex items-center gap-2 px-1">
        <time className="text-xs tabular-nums text-subtle">{msg.at}</time>
        <button type="button" onClick={onReply} className="text-xs text-subtle hover:text-foreground">
          Reply
        </button>
        <button type="button" onClick={onReact} className="text-xs text-subtle hover:text-foreground">
          Mark
        </button>
        {msg.reactions?.map((r) => (
          <span key={r.glyph} className="rounded-full bg-raised px-1.5 text-xs text-muted">
            {r.glyph} {r.n}
          </span>
        ))}
      </div>
    </article>
  );
}

function Composer() {
  const draft = useMessenger((s) => s.draft);
  const setDraft = useMessenger((s) => s.setDraft);
  const send = useMessenger((s) => s.send);
  const replyTo = useMessenger((s) => s.replyTo);
  const setReply = useMessenger((s) => s.setReply);
  const messages = useMessenger((s) => s.messages);
  const quoted = messages.find((m) => m.id === replyTo);

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="mx-auto max-w-2xl">
        {quoted ? (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-raised px-3 py-2 text-xs text-muted">
            <span className="truncate">Replying · {quoted.text}</span>
            <button type="button" aria-label="Cancel reply" onClick={() => setReply(undefined)}>
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-1 rounded-3xl bg-raised p-1.5 shadow-border">
          <button
            type="button"
            aria-label="Attach a file"
            onClick={() => send("brief.pdf", "file")}
            className="grid size-11 place-items-center text-muted hover:text-foreground"
          >
            <Paperclip className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Send a voice note"
            onClick={() => send("Voice note · 0:04", "voice")}
            className="grid size-11 place-items-center text-muted hover:text-foreground"
          >
            <Mic className="size-4" />
          </button>
          <textarea
            rows={1}
            value={draft}
            aria-label="Message"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-sm text-foreground outline-none placeholder:text-subtle"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={!draft.trim()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Inspector({ className }: { className?: string }) {
  const rooms = useMessenger((s) => s.rooms);
  const roomId = useMessenger((s) => s.roomId);
  const setOverlay = useMessenger((s) => s.setOverlay);
  const startCall = useMessenger((s) => s.startCall);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const members = room.members.map((id) => person(id)).filter(Boolean);

  return (
    <aside className={cn("w-72 shrink-0 flex-col border-l border-border bg-card", className)}>
      <div className="px-5 py-5">
        <p className="text-xs font-medium tracking-widest text-subtle">ROOM</p>
        <p className="mt-2 font-display text-2xl tracking-tight">{room.name}</p>
        <p className="mt-1 text-xs text-muted">
          {room.kind === "group" ? "Group" : "Direct"} · {members.length} people
        </p>
      </div>
      <div className="mx-4 rounded-2xl bg-raised p-4">
        <div className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-accent" />
          {room.encrypted ? "Private" : "Shared host"}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {room.encrypted
            ? "Only people in this room. Devices stay yours."
            : "Ops is on the current stack. Treat it as dogfood."}
        </p>
        <button
          type="button"
          onClick={startCall}
          className="mt-3 w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground"
        >
          Call
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-2 px-1 text-xs font-medium tracking-widest text-subtle">PEOPLE</p>
        <ul className="flex flex-col gap-1">
          {members.map((p) =>
            p ? (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="relative">
                  <Avatar initials={p.initials} alice={p.id === "alice"} />
                  {p.online ? (
                    <span className="absolute bottom-0 right-0 size-2 rounded-full bg-ok" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.status}</span>
                </span>
              </li>
            ) : null,
          )}
        </ul>
        {room.alice ? (
          <button
            type="button"
            onClick={() => setOverlay("alice")}
            className="mt-4 w-full rounded-2xl border border-border px-3 py-3 text-left text-xs text-muted hover:text-foreground"
          >
            Alice is a guest. Open her terms.
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function OverlayPane({ overlay, roomName }: { overlay: Exclude<Overlay, null>; roomName: string }) {
  const setOverlay = useMessenger((s) => s.setOverlay);
  const query = useMessenger((s) => s.query);
  const setQuery = useMessenger((s) => s.setQuery);
  const messages = useMessenger((s) => s.messages);
  const roomId = useMessenger((s) => s.roomId);
  const rooms = useMessenger((s) => s.rooms);
  const openDm = useMessenger((s) => s.openDm);
  const muted = useMessenger((s) => s.muted);
  const toggleMute = useMessenger((s) => s.toggleMute);
  const endCall = useMessenger((s) => s.endCall);
  const calling = useMessenger((s) => s.calling);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!calling) {
      setElapsed(0);
      return;
    }
    const t = window.setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [calling]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return messages.filter((m) => m.convId === roomId && m.text.toLowerCase().includes(q));
  }, [messages, query, roomId]);

  const media = messages.filter((m) => m.convId === roomId && (m.kind === "file" || m.kind === "image" || m.kind === "voice"));

  const title: Record<Exclude<Overlay, null>, string> = {
    search: "Search",
    contacts: "People",
    settings: "Settings",
    call: roomName,
    media: "Files",
    alice: "Alice",
    people: "Room",
    compose: "New",
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-background/70 p-3 md:items-center">
      <div
        role="dialog"
        aria-label={title[overlay]}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-3xl bg-card p-5 shadow-border"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl tracking-tight">{title[overlay]}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => (overlay === "call" ? endCall() : setOverlay(null))}
            className="grid size-11 place-items-center rounded-full text-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {overlay === "search" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${roomName}`}
              className="h-11 rounded-2xl bg-raised px-4 text-sm outline-none ring-1 ring-border focus:ring-accent"
            />
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.id} className="border-b border-border py-3 text-sm">
                  <p className="text-xs text-muted">{person(h.authorId)?.name}</p>
                  {h.text}
                </li>
              ))}
              {query.trim().length >= 2 && hits.length === 0 ? (
                <li className="py-8 text-center text-sm text-muted">Nothing in this room.</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {overlay === "contacts" ? (
          <ul className="overflow-y-auto">
            {PEOPLE.filter((p) => p.id !== "me").map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <Avatar initials={p.initials} alice={p.id === "alice"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{p.name}</p>
                  <p className="text-xs text-muted">{p.status}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openDm(p.id, p.name)}
                  className="rounded-full bg-raised px-3 py-2 text-xs font-medium hover:bg-primary hover:text-primary-foreground"
                >
                  Message
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {overlay === "settings" ? (
          <div className="space-y-4 text-sm">
            <Field label="Display name" value="You" />
            <Field label="Status" value="In the room" />
            <Link
              to="/spec/$section"
              params={{ section: "features" }}
              className="block pt-2 text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              Internal spec
            </Link>
          </div>
        ) : null}

        {overlay === "call" ? (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="grid size-24 place-items-center rounded-full bg-raised">
              <Mark className="size-10 text-muted" />
            </div>
            <div className="text-center">
              <p className="font-display text-2xl">{roomName}</p>
              <p className="mt-1 text-sm tabular-nums text-muted">
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
                className={cn(
                  "grid size-12 place-items-center rounded-full",
                  muted ? "bg-primary text-primary-foreground" : "bg-raised text-muted",
                )}
              >
                <Mic className="size-4" />
              </button>
              <span className="grid size-12 place-items-center rounded-full bg-raised text-muted">
                <Video className="size-4" />
              </span>
              <button
                type="button"
                onClick={endCall}
                className="grid size-12 place-items-center rounded-full bg-bad text-foreground"
                aria-label="End call"
              >
                <Phone className="size-4 rotate-[135deg]" />
              </button>
            </div>
          </div>
        ) : null}

        {overlay === "media" ? (
          media.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Nothing shared yet. Attach a file from the composer.</p>
          ) : (
            <ul className="overflow-y-auto">
              {media.map((m) => (
                <li key={m.id} className="flex items-center gap-3 border-b border-border py-3 text-sm">
                  {m.kind === "voice" ? <Mic className="size-4 text-muted" /> : <FileText className="size-4 text-muted" />}
                  {m.text}
                </li>
              ))}
            </ul>
          )
        ) : null}

        {overlay === "alice" ? (
          <div className="space-y-3 text-sm leading-relaxed text-muted">
            <p className="text-foreground">Alice is a visible participant. She is never a backend observer.</p>
            <p>Access begins after admission. History before join is closed unless you share it.</p>
            <p>Removal is ordinary membership removal.</p>
          </div>
        ) : null}

        {overlay === "people" ? <Inspector className="flex border-0 bg-transparent" /> : null}
        {overlay === "compose" ? null : null}
        {rooms.length === 0 ? null : null}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        defaultValue={value}
        className="mt-1 h-11 w-full rounded-2xl bg-raised px-4 text-sm outline-none ring-1 ring-border"
      />
    </label>
  );
}

function Avatar({ initials, alice }: { initials: string; alice?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-xs font-medium",
        alice ? "bg-accent/20 text-accent" : "bg-raised text-foreground",
      )}
    >
      {alice ? <Mark className="size-4" /> : initials}
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
