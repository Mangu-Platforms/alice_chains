/**
 * Profile and account settings (BUILD_PLAN P-PROF-1).
 *
 * "View Profile" was a menu item that did nothing until F-8 removed it. This is
 * the page it should have opened.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Upload, LogOut } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { t } from "@/i18n";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  formatBytes,
} from "@contracts/attachments";
import { MAX_DISPLAY_NAME_LENGTH, MAX_STATUS_LENGTH } from "@contracts/constants";

export default function Settings() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: profile, refetch } = trpc.user.myProfile.useQuery();

  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seeded once the profile arrives, not on every render, so typing is not
  // overwritten by a background refetch.
  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setStatus(profile.status ?? "");
  }, [profile]);

  const afterChange = () => {
    refetch();
    utils.auth.me.invalidate();
    utils.conversation.list.invalidate();
  };

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      afterChange();
    },
    onError: (error) => toast.error(error.message),
  });

  const createAvatarUpload = trpc.user.createAvatarUpload.useMutation();
  const setAvatar = trpc.user.setAvatar.useMutation();
  const clearAvatar = trpc.user.clearAvatar.useMutation({
    onSuccess: () => {
      toast.success("Avatar removed");
      afterChange();
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeAll = trpc.admin.revokeAllSessions.useMutation({
    onSuccess: () => {
      toast.success("Signed out everywhere");
      // Including here: the current session was revoked too.
      window.location.href = "/login";
    },
    onError: (error) => toast.error(error.message),
  });

  async function handleAvatarSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Choose a JPEG, PNG, GIF or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`Images must be ${formatBytes(MAX_AVATAR_BYTES)} or smaller.`);
      return;
    }

    setUploading(true);
    try {
      const target = await createAvatarUpload.mutateAsync({
        fileName: file.name,
        mimeType: file.type as never,
        byteSize: file.size,
      });

      const put = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: target.headers,
        body: file,
      });
      if (!put.ok) throw new Error("The upload failed. Please try again.");

      await setAvatar.mutateAsync({ attachmentId: target.attachmentId });
      toast.success("Avatar updated");
      afterChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const nameChanged = profile ? name.trim() !== (profile.name ?? "") : false;
  const statusChanged = profile ? status.trim() !== (profile.status ?? "") : false;

  return (
    <div className="h-screen w-full bg-background flex flex-col">
      <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/30">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("a11y.back")}
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-bold text-lg">Settings</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-6 space-y-8">
          {!profile ? (
            <div className="py-12 text-center">
              <Spinner className="w-6 h-6 mx-auto" />
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Picture</h2>
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={profile.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/20 text-primary text-lg">
                      {profile.name?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="sr-only"
                      accept={ALLOWED_IMAGE_TYPES.join(",")}
                      onChange={(e) => handleAvatarSelected(e.target.files)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <Spinner className="w-4 h-4" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      {uploading ? "Uploading…" : "Upload"}
                    </Button>
                    {profile.hasUploadedAvatar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-destructive"
                        disabled={clearAvatar.isPending}
                        onClick={() => clearAvatar.mutate()}
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, GIF or WebP, up to {formatBytes(MAX_AVATAR_BYTES)}.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold">Profile</h2>

                <div className="space-y-1.5">
                  <label htmlFor="display-name" className="text-xs text-muted-foreground">
                    Display name
                  </label>
                  <Input
                    id="display-name"
                    value={name}
                    maxLength={MAX_DISPLAY_NAME_LENGTH}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="status-text" className="text-xs text-muted-foreground">
                    Status
                  </label>
                  <Input
                    id="status-text"
                    value={status}
                    maxLength={MAX_STATUS_LENGTH}
                    onChange={(e) => setStatus(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                    {status.length} / {MAX_STATUS_LENGTH}
                  </p>
                </div>

                <Button
                  onClick={() =>
                    updateProfile.mutate({
                      ...(nameChanged ? { name: name.trim() } : {}),
                      ...(statusChanged ? { status: status.trim() } : {}),
                    })
                  }
                  disabled={
                    updateProfile.isPending ||
                    (!nameChanged && !statusChanged) ||
                    name.trim().length === 0
                  }
                >
                  {updateProfile.isPending ? "Saving…" : "Save changes"}
                </Button>
              </section>

              <section className="space-y-3 pt-4 border-t border-border">
                <h2 className="text-sm font-semibold">Security</h2>
                <p className="text-xs text-muted-foreground">
                  Signs out every browser and device, including this one. Use it if
                  you have signed in somewhere you no longer control.
                </p>
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={revokeAll.isPending}
                  onClick={() => revokeAll.mutate()}
                >
                  <LogOut className="w-4 h-4" />
                  {revokeAll.isPending ? "Signing out…" : "Sign out everywhere"}
                </Button>
              </section>

              <section className="space-y-1 pt-4 border-t border-border">
                <h2 className="text-sm font-semibold">Account</h2>
                <p className="text-xs text-muted-foreground">
                  Signed in as {profile.email || "an account with no email address"}.
                </p>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
