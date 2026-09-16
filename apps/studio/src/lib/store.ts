import { create } from "zustand";
import { MESSAGES, ROOMS, type Msg, type Room } from "@/data/demo";

export type Overlay =
  | null
  | "search"
  | "contacts"
  | "settings"
  | "call"
  | "media"
  | "alice"
  | "people"
  | "compose";

const KEY = "alisons-v1";

type Persist = {
  roomId: string;
  messages: Msg[];
  rooms: Room[];
};

function load(): Persist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persist;
  } catch {
    return null;
  }
}

function save(s: Persist) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

type State = {
  roomId: string;
  rooms: Room[];
  messages: Msg[];
  draft: string;
  replyTo?: string;
  overlay: Overlay;
  query: string;
  mobile: "list" | "thread";
  typing: string | null;
  muted: boolean;
  calling: boolean;
  setRoom: (id: string) => void;
  setDraft: (v: string) => void;
  setReply: (id?: string) => void;
  setOverlay: (o: Overlay) => void;
  setQuery: (q: string) => void;
  setMobile: (m: "list" | "thread") => void;
  send: (text?: string, kind?: Msg["kind"]) => void;
  react: (id: string) => void;
  openDm: (personId: string, name: string) => void;
  toggleMute: () => void;
  startCall: () => void;
  endCall: () => void;
  hydrate: () => void;
};

function bumpRoom(rooms: Room[], roomId: string, preview: string): Room[] {
  return rooms.map((r) =>
    r.id === roomId ? { ...r, preview, time: "Now", unread: 0 } : r,
  );
}

export const useMessenger = create<State>((set, get) => ({
  roomId: "studio",
  rooms: ROOMS,
  messages: MESSAGES,
  draft: "",
  overlay: null,
  query: "",
  mobile: "list",
  typing: null,
  muted: false,
  calling: false,
  hydrate: () => {
    const data = load();
    if (!data) return;
    set({ roomId: data.roomId, rooms: data.rooms, messages: data.messages });
  },
  setRoom: (id) => {
    set((s) => ({
      roomId: id,
      mobile: "thread",
      overlay: null,
      rooms: s.rooms.map((r) => (r.id === id ? { ...r, unread: 0 } : r)),
    }));
    persist();
  },
  setDraft: (draft) => set({ draft }),
  setReply: (replyTo) => set({ replyTo }),
  setOverlay: (overlay) => set({ overlay }),
  setQuery: (query) => set({ query }),
  setMobile: (mobile) => set({ mobile }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  startCall: () => set({ overlay: "call", calling: true }),
  endCall: () => set({ overlay: null, calling: false, muted: false }),
  openDm: (personId, name) => {
    const existing = get().rooms.find((r) => r.id === personId);
    if (existing) {
      get().setRoom(personId);
      return;
    }
    const room: Room = {
      id: personId,
      name,
      kind: "dm",
      preview: "New conversation",
      time: "Now",
      unread: 0,
      encrypted: true,
      members: ["me", personId],
    };
    set((s) => ({
      rooms: [room, ...s.rooms],
      roomId: personId,
      mobile: "thread",
      overlay: null,
    }));
    persist();
  },
  send: (override, kind = "text") => {
    const { draft, roomId, replyTo, messages, rooms } = get();
    const text = (override ?? draft).trim();
    if (!text) return;
    const msg: Msg = {
      id: `m${Date.now()}`,
      convId: roomId,
      authorId: "me",
      text,
      at: nowClock(),
      mine: true,
      replyTo,
      kind,
    };
    set({
      messages: [...messages, msg],
      draft: "",
      replyTo: undefined,
      rooms: bumpRoom(rooms, roomId, `You: ${text}`),
    });
    persist();
    scheduleReply(roomId);
  },
  react: (id) => {
    set({
      messages: get().messages.map((m) => {
        if (m.id !== id) return m;
        const current = m.reactions ?? [];
        const mine = current.find((r) => r.mine);
        if (mine) {
          return {
            ...m,
            reactions: current
              .map((r) => (r.mine ? { ...r, n: r.n - 1, mine: false } : r))
              .filter((r) => r.n > 0),
          };
        }
        return {
          ...m,
          reactions: [...current, { glyph: "→", n: 1, mine: true }],
        };
      }),
    });
    persist();
  },
}));

function persist() {
  const s = useMessenger.getState();
  save({ roomId: s.roomId, messages: s.messages, rooms: s.rooms });
}

function nowClock() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const REPLIES = [
  "Heard.",
  "Keep going.",
  "That lands.",
  "Yes. One room.",
  "Ship it while it's warm.",
  "I'm in.",
];

function scheduleReply(roomId: string) {
  const room = useMessenger.getState().rooms.find((r) => r.id === roomId);
  const other =
    room?.members.find((id) => id !== "me" && id !== "alice") ??
    room?.members.find((id) => id !== "me");
  if (!other) return;
  window.setTimeout(() => {
    if (useMessenger.getState().roomId === roomId) {
      useMessenger.setState({ typing: other });
    }
  }, 500);
  window.setTimeout(() => {
    const s = useMessenger.getState();
    const text = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    const msg: Msg = {
      id: `r${Date.now()}`,
      convId: roomId,
      authorId: other,
      text,
      at: nowClock(),
    };
    useMessenger.setState({
      typing: null,
      messages: [...s.messages, msg],
      rooms: s.rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              preview: text,
              time: "Now",
              unread: s.roomId === roomId ? 0 : r.unread + 1,
            }
          : r,
      ),
    });
    persist();
  }, 1400);
}
