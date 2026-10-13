import { PauseIcon, PlayIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The round pause/play control shared by the landing's decorative animations. */
export function PlayPauseButton({
  playing,
  onToggle,
  className,
}: {
  playing: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? "Pause animation" : "Play animation"}
      className={cn(
        "grid size-8 place-items-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
    </button>
  );
}
