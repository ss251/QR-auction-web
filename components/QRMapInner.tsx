'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Icon, Map as LeafletMap } from "leaflet";
import dynamic from 'next/dynamic';

// Dynamically import MarkerClusterGroup to avoid CSS loading issues
const MarkerClusterGroup = dynamic(() => import("react-leaflet-cluster"), { 
  ssr: false 
});

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

const QRMapInner = forwardRef<QRMapRef, QRMapProps>(({ entries, onRefresh }, ref) => {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapId] = useState(() => `map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  useImperativeHandle(ref, () => ({
    refreshData: onRefresh || (async () => {})
  }));

  const customIcon = useMemo(() => new Icon({
    iconUrl: "/pin.png",
    iconSize: [38, 38],
  }), []);

  useEffect(() => {
    let L: any;
    let map: LeafletMap | null = null;

    const initMap = async () => {
      if (!containerRef.current) return;

      try {
        // Import Leaflet dynamically
        L = await import('leaflet');
        
        // Remove any existing map instance first
        if (mapRef.current) {
          console.log('Removing existing map...');
          mapRef.current.remove();
          mapRef.current = null;
        }

        // Clear the container
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }

        // Create new map instance
        console.log('Creating new map...');
        map = L.map(containerRef.current).setView([24.071521, 9.615584725366856], 2);
        mapRef.current = map;

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          minZoom: 2,
          maxZoom: 18
        }).addTo(map);

        // Add markers
        entries
          .filter(item => item.latitude && item.longitude)
          .forEach((item) => {
            const marker = L.marker([item.latitude!, item.longitude!], { icon: customIcon }).addTo(map);
            
            const popupContent = `
              <div style="max-width: 300px; display: flex; flex-direction: column; align-items: center;">
                ${item.city ? `<div style="font-weight: bold; margin-bottom: 8px; text-align: center;">${item.city}</div>` : ''}
                ${item.image_url ? `<img src="${item.image_url}" alt="Location" loading="lazy" style="max-width: 100%; height: auto; margin-bottom: 8px;" />` : ''}
                ${item.uploader_id ? `
                  <div style="margin-top: 8px; font-size: 0.95em; text-align: center;">
                    <span style="color: #3366cc;">
                      by ${item.uploader_type === 'farcaster' 
                        ? item.uploader_id
                        : item.twitter_username 
                        ? `@${item.twitter_username}` 
                        : item.uploader_id
                      }
                    </span>
                  </div>
                ` : ''}
              </div>
            `;
            
            marker.bindPopup(popupContent);
          });

      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    initMap();

    // Cleanup function
    return () => {
      console.log('Cleaning up map...');
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [entries, customIcon]);

  return (
    <div 
      ref={containerRef}
      id={mapId}
      style={{ height: "100%", width: "100%", zIndex: 1 }}
    />
  );
});

QRMapInner.displayName = 'QRMapInner';

export default QRMapInner;