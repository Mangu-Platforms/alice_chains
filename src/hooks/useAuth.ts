import { trpc } from "@/providers/trpc";

export function useAuth() {
  const query = trpc.auth.me.useQuery(undefined, { retry: false });
  const logout = () => {
    window.location.href = "/api/logout";
  };
  return {
    user: query.data,
    // S-18 narrowed `auth.me`; `isAdmin` is a boolean rather than the raw role,
    // and the server re-checks on every administrative call regardless.
    isAdmin: query.data?.isAdmin ?? false,
    isLoading: query.isLoading,
    logout,
  };
}
