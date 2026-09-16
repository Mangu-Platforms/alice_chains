export type Story = {
  id: string;
  persona: string;
  want: string;
  so: string;
  status: "met" | "partial" | "unmet";
};

export const STORIES: Story[] = [
  { id: "US-01", persona: "Founder", want: "stand up a private room for my three co-founders this afternoon", so: "we stop leaking strategy into Slack", status: "partial" },
  { id: "US-02", persona: "Member", want: "send a message and know it arrived", so: "I do not double-send", status: "met" },
  { id: "US-03", persona: "Member", want: "see unread counts and presence", so: "I know who is here", status: "met" },
  { id: "US-04", persona: "Member", want: "reply, edit, react, attach", so: "the room feels like a modern messenger", status: "met" },
  { id: "US-05", persona: "Member", want: "search last month", so: "I can find the decision", status: "partial" },
  { id: "US-06", persona: "Member", want: "block a person completely", so: "they cannot reach me", status: "met" },
  { id: "US-07", persona: "Member", want: "call the room", so: "we do not jump to another app", status: "unmet" },
  { id: "US-08", persona: "Member", want: "leave a voice note while walking", so: "I am not typing", status: "unmet" },
  { id: "US-09", persona: "Member", want: "know the host cannot read this", so: "I will put real things in it", status: "unmet" },
  { id: "US-10", persona: "Member", want: "kill a stolen laptop from my phone", so: "yesterday's messages stay closed", status: "unmet" },
  { id: "US-11", persona: "Member", want: "admit Alice to summarize, then remove her", so: "AI is a guest with a name", status: "unmet" },
  { id: "US-12", persona: "Owner", want: "export or erase a member", so: "I can answer a DSAR", status: "partial" },
  { id: "US-13", persona: "Owner", want: "run this on my own metal", so: "data never leaves the building", status: "partial" },
  { id: "US-14", persona: "IT admin", want: "SSO and SCIM", so: "offboarding is automatic", status: "unmet" },
  { id: "US-15", persona: "Counsel", want: "legal hold on a MANAGED room", so: "we can answer discovery without breaking PRIVATE rooms", status: "unmet" },
  { id: "US-16", persona: "New user", want: "be in a room ten minutes after install", so: "the product proves itself", status: "unmet" },
];
