'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

type Value = { pitchId: string; isHost: boolean };

const PitchSurfaceContext = createContext<Value>({ pitchId: '', isHost: false });

export function PitchSurfaceProvider({
  pitchId,
  isHost,
  children,
}: {
  pitchId: string;
  isHost: boolean;
  children: ReactNode;
}) {
  return <PitchSurfaceContext.Provider value={{ pitchId, isHost }}>{children}</PitchSurfaceContext.Provider>;
}

export function usePitchSurface(): Value {
  return useContext(PitchSurfaceContext);
}
