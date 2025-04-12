'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { initializeChannels, cleanupChannels, broadcastConnection, forceReconnect } from '@/lib/channelManager';
import { v4 as uuidv4 } from 'uuid';
import { frameSdk } from '@/lib/frame-sdk';

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const browserInstanceIdRef = useRef<string>('');
  const initialized = useRef(false);
  const wasConnectedRef = useRef(false);
  const wasFrameConnectedRef = useRef(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  // Detect mobile and Safari
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator?.userAgent || '');
  const isSafari = typeof window !== 'undefined' && /Safari/i.test(navigator?.userAgent || '') && !/Chrome/i.test(navigator?.userAgent || '');
  
  // Detect Farcaster frame environment
  const isFrame = typeof window !== 'undefined' && window.parent !== window;

  // Initialize channels on component mount, even if user isn't connected
  useEffect(() => {
    // Create a unique ID for this browser instance if not already created
    if (!browserInstanceIdRef.current) {
      // Try to get from localStorage to maintain consistency in Safari
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('qrcoin_browser_id') : null;
      if (storedId) {
        browserInstanceIdRef.current = storedId;
      } else {
        browserInstanceIdRef.current = uuidv4();
        // Store it for future use, especially important in mobile Safari
        if (typeof window !== 'undefined') {
          localStorage.setItem('qrcoin_browser_id', browserInstanceIdRef.current);
        }
      }
    }
    
    const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
    
    if (!initialized.current) {
      console.log('SupabaseProvider: Initializing channels for user', userId);
      initializeChannels(userId, browserInstanceIdRef.current);
      initialized.current = true;
      
      return () => {
        console.log('SupabaseProvider: Cleaning up channels');
        cleanupChannels();
        initialized.current = false;
      };
    }
  }, [address, isConnected]);
  
  // Re-initialize if the connection state changes
  useEffect(() => {
    if (initialized.current) {
      const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
      console.log('SupabaseProvider: Re-initializing channels after connection change for', userId);
      initializeChannels(userId, browserInstanceIdRef.current);
    }
  }, [isConnected, address]);
  
  // Add specific event handlers for mobile and Safari
  useEffect(() => {
    if (!isMobile && !isSafari) return;
    
    // For mobile and Safari: add extra reconnection on page focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && initialized.current) {
        // Avoid multiple rapid reconnections
        if (!isReconnecting) {
          setIsReconnecting(true);
          
          const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
          console.log('SupabaseProvider: Mobile/Safari visibility change, reconnecting for', userId);
          
          // Force reconnect with a slight delay to let the browser settle
          setTimeout(() => {
            forceReconnect();
            setIsReconnecting(false);
          }, 300);
        }
      }
    };
    
    // Safari-specific page show handler
    const handlePageShow = (e: PageTransitionEvent) => {
      // Only react on page restore (when navigating back)
      if (e.persisted && initialized.current) {
        const userId = isConnected && address ? address : `anonymous-${browserInstanceIdRef.current.slice(0, 8)}`;
        console.log('SupabaseProvider: Page was restored from cache, reconnecting for', userId);
        
        setIsReconnecting(true);
        setTimeout(() => {
          forceReconnect();
          setIsReconnecting(false);
        }, 300);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [isMobile, isSafari, isConnected, address, isReconnecting]);
  
  // Broadcast wallet connection event when a user connects
  useEffect(() => {
    // Only broadcast if the wallet was just connected (not on initial render)
    if (isConnected && address && initialized.current && !wasConnectedRef.current) {
      console.log('SupabaseProvider: Broadcasting wallet connection for', address);
      broadcastConnection(address, browserInstanceIdRef.current);
      
      // For mobile/Safari, try once more after a delay to ensure it gets through
      if (isMobile || isSafari) {
        setTimeout(() => {
          console.log('SupabaseProvider: Sending follow-up mobile wallet connection for', address);
          broadcastConnection(address, browserInstanceIdRef.current);
        }, 1000);
      }
    }
    
    // Update the connection state reference
    wasConnectedRef.current = isConnected && !!address;
  }, [isConnected, address, isMobile, isSafari]);
  
  // Special handling for Farcaster frames
  useEffect(() => {
    // Only apply this logic in Farcaster frame environments
    if (!isFrame) return;
    
    const checkFrameWalletConnection = async () => {
      try {
        // Check if wallet is already connected when the frame loads
        const isWalletConnected = await frameSdk.isWalletConnected();
        console.log('Frame wallet connection check:', isWalletConnected);
        
        // If wallet is connected but we haven't broadcasted the connection yet
        if (isWalletConnected && address && !wasFrameConnectedRef.current) {
          console.log('SupabaseProvider: Broadcasting frame wallet connection for', address);
          // Broadcast the connection with a slight delay to ensure channels are initialized
          setTimeout(() => {
            broadcastConnection(address, browserInstanceIdRef.current);
          }, 500);
          
          wasFrameConnectedRef.current = true;
        }
      } catch (error) {
        console.error('Error checking frame wallet connection:', error);
      }
    };
    
    // Check initial frame wallet state
    if (initialized.current) {
      checkFrameWalletConnection();
    }
    
    // Also check when address or connection state changes in frame context
    if (isConnected && address && initialized.current) {
      checkFrameWalletConnection();
    }
    
  }, [isFrame, address, isConnected]);
  
  return <>{children}</>;
} 