import { createSessionToken, getSessionToken, verifySessionToken } from "./session";
import { findUserByUnionId, upsertUser } from "../queries/users";

export async function authenticateRequest(headers: Headers) {
  const sessionToken = getSessionToken(headers);
  if (!sessionToken) {
    return undefined;
  }

  try {
    const sessionData = verifySessionToken(sessionToken);

    if (sessionData?.unionId) {
      const user = await findUserByUnionId(sessionData.unionId);
      return user || undefined;
    }
  } catch {
    // Invalid token
  }

  return undefined;
}

export function createOAuthCallbackHandler() {
  return async (c: { req: { raw: Request }; json: (data: unknown, status?: number) => Response }) => {
    const url = new URL(c.req.raw.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return c.json({ error: "Missing authorization code" }, 400);
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch(
        `${process.env.VITE_KIMI_AUTH_URL}/api/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code,
            client_id: process.env.VITE_APP_ID,
            client_secret: process.env.APP_SECRET,
            grant_type: "authorization_code",
            redirect_uri: `${url.origin}/api/oauth/callback`,
          }),
        }
      );

      if (!tokenResponse.ok) {
        return c.json({ error: "Failed to exchange code" }, 400);
      }

      const tokenData = await tokenResponse.json();

      // Get user info
      const userResponse = await fetch(
        `${process.env.VITE_KIMI_AUTH_URL}/api/oauth/userinfo`,
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      if (!userResponse.ok) {
        return c.json({ error: "Failed to get user info" }, 400);
      }

      const userData = await userResponse.json();

      // Upsert user in database
      await upsertUser({
        unionId: userData.unionId || userData.id,
        name: userData.name || userData.nickname || "User",
        email: userData.email || null,
        avatar: userData.avatar || null,
      });

      // Find the user to get the database ID
      const user = await findUserByUnionId(userData.unionId || userData.id);

      if (!user) {
        return c.json({ error: "Failed to create user" }, 500);
      }

      // Create session token
      const sessionToken = createSessionToken({
          userId: user.id,
          unionId: user.unionId,
          name: user.name || "User",
          email: user.email || undefined,
      });

      // Set cookie and redirect
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": `alice_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
        },
      });
    } catch (error) {
      console.error("OAuth callback error:", error);
      return c.json({ error: "Authentication failed" }, 500);
    }
  };
}
