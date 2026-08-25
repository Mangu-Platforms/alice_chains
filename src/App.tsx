import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";
import AuthLayout from "./components/AuthLayout";
import { AuthLayoutSkeleton } from "./components/AuthLayoutSkeleton";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

/**
 * S-16. The signed-in routes are split out of the entry chunk.
 *
 * Every feature of Waves 4 and 5 landed on the critical path, because there was
 * only ever one chunk — the emoji picker, the attachment flow, the group
 * dialog and their icons were all downloaded before the login page could
 * render. `Login` and `NotFound` stay eager: they are what an unauthenticated
 * visitor sees, and lazily loading the first screen only adds a round trip.
 */
const Chat = lazy(() => import("./pages/Chat"));
const Contacts = lazy(() => import("./pages/Contacts"));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AuthLayout />}>
        <Route
          path="/"
          element={
            // The skeleton the app already uses while resolving a session, so
            // a chunk fetch looks like the load it is rather than a blank page.
            <Suspense fallback={<AuthLayoutSkeleton />}>
              <Chat />
            </Suspense>
          }
        />
        <Route
          path="/contacts"
          element={
            <Suspense fallback={<AuthLayoutSkeleton />}>
              <Contacts />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
