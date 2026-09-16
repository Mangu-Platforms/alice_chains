import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/spec/")({
  beforeLoad: () => {
    throw redirect({ to: "/spec/$section", params: { section: "features" } });
  },
});
