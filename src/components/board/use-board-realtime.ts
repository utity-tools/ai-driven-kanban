"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createClient } from "@/lib/db/client";
import type { BoardMember, Person } from "@/lib/boards/view-model";
import { ACCESS_LOST_HREF, rememberAccessLost } from "@/lib/realtime/access-lost";
import { mayAffectAccess, parseChangeNotice } from "@/lib/realtime/change-notice";
import { type LocalActivity, isOwnChange } from "@/lib/realtime/local-activity";
import {
  type PresencePayload,
  type PresenceState,
  viewersFromPresence,
} from "@/lib/realtime/presence";
import { createRefreshScheduler } from "@/lib/realtime/refresh-scheduler";

/** How long the channel may be down before the header says live updates are paused. */
const PAUSED_AFTER_MS = 4000;

type Options = {
  boardId: string;
  boardTitle: string;
  userId: string;
  members: readonly BoardMember[];
  /** What this tab is mutating; tells our own changes from the same user's other tabs. */
  localActivity: RefObject<LocalActivity>;
};

export type BoardRealtime = {
  /** Other members currently on the board (deduplicated across tabs). */
  viewers: Person[];
  /** The live channel has been down for a while; the board still works, it just won't auto-update. */
  paused: boolean;
};

/**
 * Keeps the board live. Board changes arrive as `change` broadcasts on the
 * private channel `board:<id>` (sent by the database, members only via RLS on
 * realtime.messages) and trigger a coalesced `router.refresh()`; the server
 * stays the source of truth. Presence on the same channel tells who else is
 * looking.
 *
 * Auth: the browser client feeds the session's access token to the realtime
 * socket (and refreshes it on token changes); `setAuth()` below just makes
 * sure it is loaded before joining. Phoenix rejoins errored/timed-out
 * channels by itself, so no manual retry.
 */
export function useBoardRealtime({
  boardId,
  boardTitle,
  userId,
  members,
  localActivity,
}: Options): BoardRealtime {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [presence, setPresence] = useState<PresenceState>({});
  const [paused, setPaused] = useState(false);

  const scheduler = useRef<ReturnType<typeof createRefreshScheduler> | null>(null);
  const wasRefreshing = useRef(false);
  const titleRef = useRef(boardTitle);
  useEffect(() => {
    titleRef.current = boardTitle;
  }, [boardTitle]);

  // A refresh is done when its transition stops pending.
  useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) scheduler.current?.settled();
    wasRefreshing.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let pausedTimer: ReturnType<typeof setTimeout> | null = null;
    let hadConnection = false;
    let checkedAfterError = false;

    const refresher = createRefreshScheduler({
      run: () =>
        startRefresh(() => {
          router.refresh();
        }),
    });
    scheduler.current = refresher;

    /** Leaves for /boards when the viewer was removed; otherwise refreshes. */
    async function refreshIfStillMember() {
      try {
        const { data, error } = await supabase
          .from("board_members")
          .select("user_id")
          .eq("board_id", boardId)
          .eq("user_id", userId)
          .maybeSingle();
        if (disposed) return;
        if (!error && data === null) {
          refresher.cancel();
          rememberAccessLost(titleRef.current);
          router.replace(ACCESS_LOST_HREF);
          return;
        }
      } catch {
        // Could not check: fall through and let the refresh decide.
      }
      if (!disposed) refresher.request();
    }

    const channel = supabase.channel(`board:${boardId}`, {
      config: { private: true, presence: { key: userId } },
    });

    channel
      .on("broadcast", { event: "change" }, ({ payload }) => {
        const notice = parseChangeNotice(payload);
        // Membership changes or a deleted board may have removed the viewer: check first.
        if (mayAffectAccess(notice)) void refreshIfStillMember();
        // A change made by this tab: the Server Action already brought the fresh board
        // back, and a second refresh would re-render mid-interaction. The same user's
        // other tabs and devices have no local mutation, so they do refresh.
        else if (!isOwnChange(notice, userId, localActivity.current, Date.now())) {
          refresher.request();
        }
      })
      .on("presence", { event: "sync" }, () => {
        if (!disposed) setPresence({ ...channel.presenceState() });
      });

    void supabase.realtime.setAuth().finally(() => {
      if (disposed) return;
      channel.subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          if (pausedTimer) clearTimeout(pausedTimer);
          pausedTimer = null;
          setPaused(false);
          checkedAfterError = false;
          // Catch up on anything missed while the channel was down.
          if (hadConnection) void refreshIfStillMember();
          hadConnection = true;
          const payload: PresencePayload = { user_id: userId };
          void channel.track(payload);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // A rejected join may mean the viewer was removed: check once per outage.
          if (status === "CHANNEL_ERROR" && !checkedAfterError) {
            checkedAfterError = true;
            void refreshIfStillMember();
          }
          pausedTimer ??= setTimeout(() => setPaused(true), PAUSED_AFTER_MS);
        }
      });
    });

    // Events can be missed while the tab is hidden (throttled sockets, sleep).
    function onVisibility() {
      if (document.visibilityState === "visible") void refreshIfStillMember();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (pausedTimer) clearTimeout(pausedTimer);
      refresher.cancel();
      scheduler.current = null;
      void supabase.removeChannel(channel);
    };
  }, [boardId, userId, router, localActivity]);

  const viewers = useMemo(
    () => viewersFromPresence(presence, members, userId),
    [presence, members, userId],
  );

  return { viewers, paused };
}
