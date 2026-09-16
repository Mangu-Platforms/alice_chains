export type ShipStatus =
  | "shipped"
  | "stub"
  | "hygiene"
  | "specified"
  | "parked"
  | "missing";

export const STATUS_LABEL: Record<ShipStatus, string> = {
  shipped: "In the repo",
  stub: "Button only",
  hygiene: "Open hygiene",
  specified: "Specified, unbuilt",
  parked: "Parked track",
  missing: "Not yet specified",
};

export const STATUS_TONE: Record<ShipStatus, string> = {
  shipped: "text-ok",
  stub: "text-warn",
  hygiene: "text-warn",
  specified: "text-accent",
  parked: "text-muted",
  missing: "text-bad",
};
