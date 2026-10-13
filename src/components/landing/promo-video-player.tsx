"use client";

import { PlayIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * A YouTube facade: a local poster and a play button, so nothing is requested from YouTube
 * until the visitor asks for the video. youtube-nocookie sets no cookies until playback.
 */
export function PromoVideoPlayer({
  youtubeId,
  playLabel,
  frameTitle,
}: {
  youtubeId: string;
  playLabel: string;
  frameTitle: string;
}) {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // The button that had focus is gone: move focus to the player so keyboard users can control it.
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border bg-card">
      {playing ? (
        <iframe
          ref={frameRef}
          // Desktop browsers autoplay after the click; some mobile ones need a second tap.
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&playsinline=1`}
          title={frameTitle}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          // YouTube refuses embeds without a referrer (error 153); this is also the site default.
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 size-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <Image
            src="/landing/promo-poster.png"
            alt=""
            fill
            sizes="(min-width: 1152px) 1120px, 100vw"
            className="object-cover"
          />
          <span className="absolute inset-x-0 bottom-3 mx-auto flex w-fit items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-sm transition-transform group-hover:scale-105 sm:bottom-8">
            <PlayIcon className="size-4 fill-current text-ai" aria-hidden="true" />
            {playLabel}
          </span>
        </button>
      )}
    </div>
  );
}
