/**
 * The media drawer's arrangement (BUILD_PLAN P-UX-4).
 *
 * `attachment.listForConversation` returns one flat list in upload order,
 * which is the right thing for an API to return and the wrong thing to show:
 * a drawer opened to find "that picture from earlier" wants the newest first,
 * and wants pictures separated from documents, because the two are looked for
 * in completely different ways — one by eye, one by name.
 */
export interface MediaItem {
  id: number;
  messageId: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  isImage: boolean;
  url: string;
  createdAt: Date;
}

export interface GroupedMedia<T> {
  images: T[];
  files: T[];
  total: number;
}

/**
 * Split into images and everything else, newest first within each.
 *
 * The sort is by id rather than by `createdAt`: ids are assigned by the
 * database in insertion order, so two attachments uploaded inside the same
 * millisecond still order deterministically. Sorting by a timestamp alone
 * leaves them to whatever order the rows happened to arrive in, which is how a
 * list re-orders itself between two renders of the same data.
 */
export function groupAttachments<T extends { id: number; isImage: boolean }>(
  attachments: readonly T[] | undefined
): GroupedMedia<T> {
  const newestFirst = [...(attachments ?? [])].sort((a, b) => b.id - a.id);

  return {
    images: newestFirst.filter((a) => a.isImage),
    files: newestFirst.filter((a) => !a.isImage),
    total: newestFirst.length,
  };
}
