'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export type GuidedSyncFrame = {
  presenterActive: boolean;
  slideIndex: number;
  scrollRatio: number;
  zoom: number;
  cursorX: number | null;
  cursorY: number | null;
  at: number;
};

const channelName = (sessionId: string) => `guided:${sessionId}`;

/** Ephemeral low-latency sync via Supabase Realtime broadcast. */
export function usePitchRealtimeSync(opts: { sessionId: string; isPublisher: boolean }) {
  const { sessionId, isPublisher } = opts;
  const [lastFrame, setLastFrame] = useState<GuidedSyncFrame | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(channelName(sessionId), { config: { broadcast: { ack: false, self: true } } });
    if (isPublisher) {
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') chRef.current = ch;
      });
    } else {
      ch.on('broadcast', { event: 'frame' }, ({ payload }) => {
        const p = payload as GuidedSyncFrame;
        if (p && typeof p.slideIndex === 'number') setLastFrame(p);
      }).subscribe((status) => {
        if (status === 'SUBSCRIBED') chRef.current = ch;
      });
    }
    return () => {
      chRef.current = null;
      void sb.removeChannel(ch);
    };
  }, [isPublisher, sessionId]);

  const publish = useCallback(
    (frame: GuidedSyncFrame) => {
      const ch = chRef.current;
      if (!ch || !isPublisher) return;
      void ch.send({ type: 'broadcast', event: 'frame', payload: frame });
    },
    [isPublisher],
  );

  return { lastFrame, publish };
}
