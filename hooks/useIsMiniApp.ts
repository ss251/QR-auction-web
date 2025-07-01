import { useState, useEffect } from 'react';
import { frameSdk } from '@/lib/frame-sdk-singleton';
import { MiniKit } from '@worldcoin/minikit-js';

/**
 * Hook to detect if the app is running in a mini app context (Farcaster or World)
 * Returns { isMiniApp: boolean, isLoading: boolean, miniAppType: 'farcaster' | 'world' | null }
 */
export function useIsMiniApp() {
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [miniAppType, setMiniAppType] = useState<'farcaster' | 'world' | null>(null);

  useEffect(() => {
    async function checkMiniApp() {
      try {
        // Check for Farcaster Frame SDK first
        const isFarcasterFrame = await frameSdk.isInMiniApp();
        
        if (isFarcasterFrame) {
          setIsMiniApp(true);
          setMiniAppType('farcaster');
          setIsLoading(false);
          return;
        }
        
        // Check for World Mini App using MiniKit.isInstalled()
        // This will only return true if properly initialized inside World App
        if (MiniKit.isInstalled()) {
          setIsMiniApp(true);
          setMiniAppType('world');
          setIsLoading(false);
          return;
        }
        
        // Not in any mini app
        setIsMiniApp(false);
        setMiniAppType(null);
        setIsLoading(false);
      } catch (error) {
        // In case of any errors, assume not in mini app
        setIsMiniApp(false);
        setMiniAppType(null);
        setIsLoading(false);
      }
    }

    checkMiniApp();
  }, []);

  return { isMiniApp, isLoading, miniAppType };
}