import { trpc } from "@/providers/trpc";

export function useAuth() {
  const query = trpc.auth.me.useQuery(undefined, { retry: false });
  const logout = () => { window.location.href = "/api/logout"; };
  return { user: query.data, isLoading: query.isLoading, logout };
}
