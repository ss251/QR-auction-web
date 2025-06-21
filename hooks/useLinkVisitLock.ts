import { useState, useEffect, useCallback } from 'react';

export function useLinkVisitLock(address: string | null | undefined, auctionId: number) {
  const [hasLock, setHasLock] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  
  const checkLockStatus = useCallback(async () => {
    if (!address || !auctionId) {
      setHasLock(false);
      return false;
    }
    
    setIsChecking(true);
    
    try {
      const response = await fetch(
        `/api/link-visit/check-lock?address=${encodeURIComponent(address)}&auctionId=${auctionId}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setHasLock(data.hasLock);
        return data.hasLock;
      }
      
      setHasLock(false);
      return false;
    } catch (error) {
      console.error('Error checking lock status:', error);
      setHasLock(false);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [address, auctionId]);
  
  // Check lock status on mount and when dependencies change
  useEffect(() => {
    checkLockStatus();
  }, [checkLockStatus]);
  
  // Poll for lock status changes every 2 seconds
  useEffect(() => {
    if (!address || !auctionId) return;
    
    const interval = setInterval(() => {
      checkLockStatus();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [address, auctionId, checkLockStatus]);
  
  return {
    hasLock,
    isChecking,
    checkLockStatus
  };
}