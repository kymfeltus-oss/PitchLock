'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

export type EngagementSnapshot = {
  scrollVelocityEwma: number;
  tabHiddenSecondsDelta: number;
  dominantSlideIndex: number | null;
};

/**
 * Ghost-mode signals: scroll skim velocity, tab visibility, dominant slide (>50% visible).
 * Pair with a periodic POST to `/api/pitch/[pitchId]/track-engagement` using `getSnapshotForMeta()`.
 */
export function useEngagementTracker() {
  const scrollVelRef = useRef(0);
  const lastWheelRef = useRef<{ t: number; y: number }>({ t: 0, y: 0 });
  const tabHiddenDeltaRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const dominantSlideRef = useRef<number | null>(null);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current != null) {
        tabHiddenDeltaRef.current += (Date.now() - hiddenAtRef.current) / 1000;
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const onWheelCapture = useCallback((e: React.WheelEvent | WheelEvent) => {
    const now = performance.now();
    const prevT = lastWheelRef.current.t || now;
    const dt = Math.max(10, now - prevT);
    const inst = Math.abs(e.deltaY) / dt;
    scrollVelRef.current = scrollVelRef.current * 0.82 + inst * 0.18;
    lastWheelRef.current = { t: now, y: e.deltaY };
  }, []);

  /** Call from IntersectionObserver when a slide crosses 50% visibility. */
  const setDominantSlideIfStrong = useCallback((slideIndex: number, intersectionRatio: number) => {
    if (intersectionRatio >= 0.5) dominantSlideRef.current = slideIndex;
  }, []);

  const consumeTabHiddenDelta = useCallback(() => {
    const v = tabHiddenDeltaRef.current;
    tabHiddenDeltaRef.current = 0;
    return v;
  }, []);

  const getSnapshotForMeta = useCallback((): Record<string, unknown> => {
    return {
      scroll_velocity_ewma: Math.round(scrollVelRef.current * 1000) / 1000,
      dominant_slide_index: dominantSlideRef.current,
    };
  }, []);

  const getSnapshot = useCallback((): EngagementSnapshot => {
    return {
      scrollVelocityEwma: scrollVelRef.current,
      tabHiddenSecondsDelta: consumeTabHiddenDelta(),
      dominantSlideIndex: dominantSlideRef.current,
    };
  }, [consumeTabHiddenDelta]);

  return useMemo(
    () => ({
      onWheelCapture,
      setDominantSlideIfStrong,
      getSnapshotForMeta,
      getSnapshot,
      consumeTabHiddenDelta,
    }),
    [consumeTabHiddenDelta, getSnapshot, getSnapshotForMeta, onWheelCapture, setDominantSlideIfStrong],
  );
}
