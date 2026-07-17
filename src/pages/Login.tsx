import { Button } from "@/components/ui/button";

export default function Login() {
  const authUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const callback = `${window.location.origin}/api/oauth/callback`;
  const href = `${authUrl}/oauth/authorize?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(callback)}&response_type=code`;
  return <main className="min-h-screen grid place-items-center bg-background"><div className="space-y-6 text-center"><h1 className="text-3xl font-bold">Alice Chains</h1><p className="text-muted-foreground">Private conversations, connected.</p><Button asChild><a href={href}>Sign in</a></Button></div></main>;
}
