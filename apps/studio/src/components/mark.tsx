import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 20 L12 4 L19 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.2 13.4 H15.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
