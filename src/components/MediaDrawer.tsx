/**
 * Everything attached to one conversation, in one place (BUILD_PLAN P-UX-4).
 *
 * F-4 added `attachment.listForConversation` and nothing rendered it, so the
 * only way to reach a file someone shared last month was to scroll a month of
 * messages looking for it.
 *
 * The list is fetched when the drawer opens, not before. Download URLs are
 * minted per request and expire — that is deliberate, so a link cannot outlive
 * the authorization decision that produced it — which makes fetching them
 * ahead of time not a cache but a set of links that go stale unused.
 */
import { Download, FileText, ImageOff } from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@contracts/attachments";
import { formatMessageTimestamp, t } from "@/i18n";
import { groupAttachments } from "@/lib/media";

export interface MediaDrawerProps {
  conversationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Take the member to the message an attachment arrived on. */
  onJumpToMessage: (messageId: number) => void;
}

export function MediaDrawer({
  conversationId,
  open,
  onOpenChange,
  onJumpToMessage,
}: MediaDrawerProps) {
  const query = trpc.attachment.listForConversation.useQuery(
    { conversationId },
    { enabled: open }
  );

  const { images, files, total } = groupAttachments(query.data);

  const jump = (messageId: number) => {
    onOpenChange(false);
    onJumpToMessage(messageId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col p-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-3">
          <SheetTitle>{t("media.title")}</SheetTitle>
          <SheetDescription>
            {query.isSuccess ? t("media.count", total) : t("media.subtitle")}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          {query.isPending ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="w-5 h-5" />
            </div>
          ) : query.isError ? (
            <p className="py-10 text-center text-sm text-destructive">
              {query.error.message}
            </p>
          ) : total === 0 ? (
            // An empty state that says what to do next, per P-UX-1.
            <div className="py-10 text-center">
              <ImageOff className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">{t("media.empty")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("media.emptyHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {images.length > 0 && (
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    {t("media.images", images.length)}
                  </h3>
                  <ul className="grid grid-cols-3 gap-1.5">
                    {images.map((image) => (
                      <li key={image.id}>
                        <button
                          onClick={() => jump(image.messageId)}
                          aria-label={t("a11y.showInConversation", image.fileName)}
                          className="block w-full aspect-square rounded-lg overflow-hidden bg-secondary/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        >
                          <img
                            src={image.url}
                            alt={image.fileName}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {files.length > 0 && (
                <section>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    {t("media.files", files.length)}
                  </h3>
                  <ul className="space-y-1">
                    {files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-secondary/50 transition-colors"
                      >
                        <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                        <button
                          onClick={() => jump(file.messageId)}
                          className="flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:underline"
                          aria-label={t("a11y.showInConversation", file.fileName)}
                        >
                          <span className="block truncate text-xs font-medium">
                            {file.fileName}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {formatBytes(file.byteSize)}
                            {" · "}
                            {formatMessageTimestamp(file.createdAt)}
                          </span>
                        </button>
                        <a
                          href={file.url}
                          download={file.fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("a11y.downloadFile", file.fileName)}
                          className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
