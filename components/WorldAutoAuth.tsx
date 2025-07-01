'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorldcoinAuth } from '@/hooks/useWorldcoinAuth';
import { useIsMiniApp } from '@/hooks/useIsMiniApp';

export function WorldAutoAuth() {
  const { miniAppType, isLoading: isMiniAppLoading } = useIsMiniApp();
  const { isAuthenticated, authenticateWithWorldcoin, isAuthenticating } = useWorldcoinAuth();
  const hasAttemptedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Wait for everything to be ready before attempting auto-auth
  useEffect(() => {
    if (isMiniAppLoading || miniAppType !== 'world') {
      return;
    }

    // Add a delay to ensure all components are mounted
    const readyTimer = setTimeout(() => {
      setIsReady(true);
    }, 2000);

    return () => clearTimeout(readyTimer);
  }, [isMiniAppLoading, miniAppType]);

  useEffect(() => {
    // Only proceed if ready and haven't attempted yet
    if (!isReady || hasAttemptedRef.current) return;
    
    // Only run in World Mini App context, if not already authenticated or authenticating
    if (miniAppType === 'world' && !isAuthenticated && !isAuthenticating) {
      hasAttemptedRef.current = true;
      
      // Authenticate immediately when ready
      authenticateWithWorldcoin()
        .then((user) => {
          if (user) {
            console.log('[WorldAutoAuth] Successfully authenticated');
          }
        })
        .catch((error) => {
          console.error('[WorldAutoAuth] Auto-authentication failed:', error);
          // Reset the flag after a delay to allow retry
          setTimeout(() => {
            hasAttemptedRef.current = false;
          }, 10000);
        });
    }
  }, [isReady, miniAppType, isAuthenticated, authenticateWithWorldcoin, isAuthenticating]);

  return null;
}