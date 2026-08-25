/**
 * BUILD_PLAN P-UX-4 — the media drawer's arrangement.
 *
 * Cases: TC-UX-10.
 */
import { describe, expect, it } from "vitest";
import { groupAttachments } from "./media";

const item = (id: number, isImage: boolean) => ({ id, isImage });

describe("grouping a conversation's media (P-UX-4)", () => {
  it("separates images from files", () => {
    // TC-UX-10a — the two are looked for in different ways: one by eye, one
    // by name, so they do not belong in one list.
    const { images, files } = groupAttachments([
      item(1, true),
      item(2, false),
      item(3, true),
    ]);

    expect(images.map((a) => a.id)).toEqual([3, 1]);
    expect(files.map((a) => a.id)).toEqual([2]);
  });

  it("puts the newest first, which is what a drawer is opened to find", () => {
    // TC-UX-10b — the API returns upload order, which is the opposite.
    const { images } = groupAttachments([item(10, true), item(40, true), item(25, true)]);
    expect(images.map((a) => a.id)).toEqual([40, 25, 10]);
  });

  it("does not mutate the array it was given", () => {
    // TC-UX-10c — the query cache owns that array; sorting it in place
    // reorders what every other consumer sees.
    const source = [item(1, true), item(9, true), item(5, true)];
    groupAttachments(source);
    expect(source.map((a) => a.id)).toEqual([1, 9, 5]);
  });

  it("counts both groups together", () => {
    expect(groupAttachments([item(1, true), item(2, false)]).total).toBe(2);
  });

  it("survives a query that has not resolved", () => {
    // TC-UX-10d — `useQuery` hands back undefined before the first response,
    // and the drawer renders on that first pass.
    expect(groupAttachments(undefined)).toEqual({ images: [], files: [], total: 0 });
    expect(groupAttachments([])).toEqual({ images: [], files: [], total: 0 });
  });
});
