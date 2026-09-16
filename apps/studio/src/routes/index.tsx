import { createFileRoute } from "@tanstack/react-router";
import { Messenger } from "@/components/product/messenger";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Messenger />;
}
