/**
 * The composer's emoji picker (BUILD_PLAN P-UX-3).
 *
 * Keyboard-operable, because a picker reachable only by pointer is a feature
 * some people simply do not have: arrow keys move within the grid, Enter
 * inserts, Escape closes.
 */
import { useRef, useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMOJI_GROUPS } from "@/lib/emoji";
import { t } from "@/i18n";

const COLUMNS = 8;

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  /** Move focus within the grid, so the whole palette is reachable by keyboard. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const buttons = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-emoji]") ?? []
    );

    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    };

    const delta = moves[event.key];
    if (delta === undefined) return;

    event.preventDefault();
    const next = buttons[index + delta];
    next?.focus();
  }

  let flatIndex = -1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          aria-label={t("a11y.insertEmoji")}
        >
          <Smile className="w-5 h-5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2"
        // The caller puts the caret back in the message after inserting;
        // letting Radix restore focus to this trigger would fight it, and
        // leave the member typing into nothing.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div ref={gridRef} className="max-h-64 overflow-y-auto space-y-3">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.name}>
              <p className="text-[11px] font-medium text-muted-foreground px-1 mb-1">
                {group.name}
              </p>
              <div className="grid grid-cols-8 gap-0.5" role="group" aria-label={group.name}>
                {group.emoji.map((emoji) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  return (
                    <button
                      key={emoji}
                      data-emoji
                      aria-label={emoji}
                      onKeyDown={(event) => handleKeyDown(event, index)}
                      onClick={() => {
                        onSelect(emoji);
                        setOpen(false);
                      }}
                      className="text-lg leading-none p-1 rounded hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none transition-colors"
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
