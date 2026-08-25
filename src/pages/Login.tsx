import { Button } from "@/components/ui/button";
import { OAUTH_LOGIN_PATH } from "@contracts/oauth";

/**
 * The authorize URL is no longer built here.
 *
 * PKCE requires the `code_verifier` to be withheld from the page, and only the
 * server can set the HttpOnly cookie that carries it — so the server owns the
 * whole URL, including `state` and the `redirect_uri` that must match the one
 * it later sends to the token endpoint. This page just follows a link.
 */
export default function Login() {
  return (
    <main className="min-h-screen grid place-items-center bg-background">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold">Alice Chains</h1>
        <p className="text-muted-foreground">Private conversations, connected.</p>
        <Button asChild>
          <a href={OAUTH_LOGIN_PATH}>Sign in</a>
        </Button>
      </div>
    </main>
  );
}
