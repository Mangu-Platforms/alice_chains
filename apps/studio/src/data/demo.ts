export type Person = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  status: string;
  online: boolean;
};

export type Msg = {
  id: string;
  convId: string;
  authorId: string;
  text: string;
  at: string;
  mine?: boolean;
  replyTo?: string;
  reactions?: { glyph: string; n: number; mine?: boolean }[];
  edited?: boolean;
  kind?: "text" | "system" | "file" | "image" | "voice";
};

export type Room = {
  id: string;
  name: string;
  kind: "dm" | "group";
  preview: string;
  time: string;
  unread: number;
  encrypted: boolean;
  alice?: boolean;
  members: string[];
};

export const ME: Person = {
  id: "me",
  name: "You",
  handle: "you",
  initials: "YO",
  status: "In the room",
  online: true,
};

export const PEOPLE: Person[] = [
  ME,
  { id: "nara", name: "Nara Okonkwo", handle: "nara", initials: "NO", status: "In the studio", online: true },
  { id: "lev", name: "Lev Hartmann", handle: "lev", initials: "LH", status: "On a train", online: true },
  { id: "mira", name: "Mira Chen", handle: "mira", initials: "MC", status: "Deep work", online: false },
  { id: "alice", name: "Alice", handle: "alice", initials: "AL", status: "In Studio", online: true },
];

export const ROOMS: Room[] = [
  {
    id: "studio",
    name: "Studio",
    kind: "group",
    preview: "Nara: the object has to fit in one hand",
    time: "2m",
    unread: 2,
    encrypted: true,
    alice: true,
    members: ["me", "nara", "lev", "mira", "alice"],
  },
  {
    id: "nara",
    name: "Nara Okonkwo",
    kind: "dm",
    preview: "Ship the feeling before the protocol",
    time: "11m",
    unread: 0,
    encrypted: true,
    members: ["me", "nara"],
  },
  {
    id: "ops",
    name: "Ops",
    kind: "group",
    preview: "You: pagination is the honest bug",
    time: "1h",
    unread: 0,
    encrypted: false,
    members: ["me", "lev", "mira"],
  },
  {
    id: "mira",
    name: "Mira Chen",
    kind: "dm",
    preview: "Hold cannot touch PRIVATE rooms",
    time: "Yesterday",
    unread: 0,
    encrypted: true,
    members: ["me", "mira"],
  },
];

export const MESSAGES: Msg[] = [
  {
    id: "s1",
    convId: "studio",
    authorId: "system",
    text: "Studio · private · Alice joined",
    at: "09:12",
    kind: "system",
  },
  {
    id: "s2",
    convId: "studio",
    authorId: "nara",
    text: "This has to be a room you would put your life in. Not a left-nav of apps.",
    at: "09:14",
  },
  {
    id: "s3",
    convId: "studio",
    authorId: "lev",
    text: "Direct, groups, presence, search, files. Calls next.",
    at: "09:16",
    reactions: [{ glyph: "→", n: 2, mine: true }],
  },
  {
    id: "s4",
    convId: "studio",
    authorId: "me",
    text: "Keep the wire. Change the object.",
    at: "09:17",
    mine: true,
  },
  {
    id: "s5",
    convId: "studio",
    authorId: "alice",
    text: "I can see this room from join. I cannot see Nara's DMs. Remove me and I lose the thread.",
    at: "09:18",
  },
  {
    id: "s6",
    convId: "studio",
    authorId: "mira",
    text: "If counsel needs hold, that is a different mode.",
    at: "09:21",
    replyTo: "s5",
  },
  {
    id: "s7",
    convId: "studio",
    authorId: "nara",
    text: "The object has to fit in one hand.",
    at: "09:24",
  },
  {
    id: "n1",
    convId: "nara",
    authorId: "nara",
    text: "Ship the feeling. People do not fall in love with the protocol.",
    at: "08:40",
  },
  {
    id: "n2",
    convId: "nara",
    authorId: "me",
    text: "Then this surface is the argument.",
    at: "08:41",
    mine: true,
    edited: true,
  },
  {
    id: "o1",
    convId: "ops",
    authorId: "lev",
    text: "History has to page. Fifty messages is not a product.",
    at: "Yesterday",
  },
  {
    id: "o2",
    convId: "ops",
    authorId: "me",
    text: "Pagination is the honest bug.",
    at: "Yesterday",
    mine: true,
  },
  {
    id: "m1",
    convId: "mira",
    authorId: "mira",
    text: "Legal hold cannot touch PRIVATE rooms.",
    at: "Yesterday",
  },
];

export function person(id: string) {
  return PEOPLE.find((p) => p.id === id);
}
