'use client';

import { ReactNode } from 'react';
import { MiniKitProvider as MiniKitProviderOfficial } from '@worldcoin/minikit-js/minikit-provider';

export default function MiniKitProvider({ children }: { children: ReactNode }) {
  return (
    <MiniKitProviderOfficial>
      {children}
    </MiniKitProviderOfficial>
  );
}