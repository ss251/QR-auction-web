'use client';

import React, { forwardRef, useImperativeHandle } from "react";
import dynamic from 'next/dynamic';

// Type for a data item from Supabase
type MapDataItem = {
  id: number;
  created_at: string;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  uploader_id: string | null;
  uploader_type: string | null;
  city: string | null;
  fid: number | null;
  twitter_username: string | null;
  wallet_address: string | null;
};

export type QRMapRef = {
  refreshData: () => Promise<void>;
};

interface QRMapProps {
  entries: MapDataItem[];
  onRefresh?: () => Promise<void>;
}

// Dynamically import the entire map to prevent initialization conflicts
const QRMapInner = dynamic(() => import('./QRMapInner'), { 
  ssr: false,
  loading: () => (
    <div className="bg-muted rounded-lg mb-8 min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    </div>
  )
});

const QRMap = forwardRef<QRMapRef, QRMapProps>(({ entries, onRefresh }, ref) => {
  useImperativeHandle(ref, () => ({
    refreshData: onRefresh || (async () => {})
  }));

  return (
    <div className="bg-muted rounded-lg mb-8 overflow-hidden" style={{ height: '400px' }}>
      <QRMapInner entries={entries} onRefresh={onRefresh} ref={ref} />
    </div>
  );
});

QRMap.displayName = 'QRMap';

export default QRMap;