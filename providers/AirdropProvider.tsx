import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAirdropEligibility } from '@/hooks/useAirdropEligibility';
import { useClaimAirdrop } from '@/hooks/useClaimAirdrop';
import { usePendingFailures } from '@/hooks/usePendingFailures';
import { AirdropClaimPopup } from '@/components/AirdropClaimPopup';
import { usePopupCoordinator } from './PopupCoordinator';

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

// Define context type
interface AirdropContextType {
  showAirdropPopup: boolean;
  setShowAirdropPopup: (show: boolean) => void;
  isEligible: boolean | null;
  isLoading: boolean;
  hasClaimed: boolean;
  isTestUser: boolean;
}

// Create context with default values
const AirdropContext = createContext<AirdropContextType>({
  showAirdropPopup: false,
  setShowAirdropPopup: () => {},
  isEligible: null,
  isLoading: true,
  hasClaimed: false,
  isTestUser: false,
});

// Hook to use the airdrop context
export const useAirdrop = () => useContext(AirdropContext);

export function AirdropProvider({ children }: { children: React.ReactNode }) {
  const [showAirdropPopup, setShowAirdropPopup] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);
  
  const { 
    isEligible, 
    isLoading, 
    hasClaimed, 
    walletAddress, 
    hasAddedFrame,
    hasNotifications,
    frameContext
  } = useAirdropEligibility();
  
  const { claimAirdrop } = useClaimAirdrop();
  
  // Check for pending failures in retry queue (no auction_id for airdrop)
  const { hasPendingFailures, isLoading: isPendingFailuresLoading } = usePendingFailures(
    walletAddress,
    null // No auction_id for airdrop claims
  );
  
  // Get popup coordinator to manage popup display
  const { requestPopup, releasePopup, isPopupActive } = usePopupCoordinator();
  
  // Check if current user is the test user
  const isTestUser = frameContext?.user?.username === TEST_USERNAME;
  
  // Reset eligibility check when hasAddedFrame or hasNotifications changes
  // This ensures we re-check when eligibility changes due to polling
  useEffect(() => {
    console.log('Frame status changed: hasAddedFrame or hasNotifications updated');
    if (hasAddedFrame && hasNotifications && !hasClaimed) {
      console.log('Resetting eligibility check due to frame status update');
      setHasCheckedEligibility(false);
    }
  }, [hasAddedFrame, hasNotifications, hasClaimed]);
  
  // Reset eligibility check when isEligible changes
  // This ensures we re-check when eligibility is finally determined
  useEffect(() => {
    console.log('isEligible changed to:', isEligible);
    if (isEligible === true) {
      setHasCheckedEligibility(false);
    }
  }, [isEligible]);

  // Sync local state with coordinator state
  useEffect(() => {
    const isActive = isPopupActive('airdrop');
    if (isActive !== showAirdropPopup) {
      setShowAirdropPopup(isActive);
    }
  }, [isPopupActive, showAirdropPopup]);
  
  // Debug logs
  useEffect(() => {
    console.log('===== AIRDROP PROVIDER DEBUG =====');
    console.log('isTestUser:', isTestUser);
    console.log('isEligible:', isEligible);
    console.log('isLoading:', isLoading);
    console.log('hasClaimed:', hasClaimed);
    console.log('hasAddedFrame:', hasAddedFrame);
    console.log('hasNotifications:', hasNotifications);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showAirdropPopup:', showAirdropPopup);
    console.log('isPopupActive:', isPopupActive('airdrop'));
  }, [isTestUser, isEligible, isLoading, hasClaimed, hasAddedFrame, hasNotifications, hasCheckedEligibility, walletAddress, showAirdropPopup, isPopupActive]);
  
  // Show popup when user is eligible and has not claimed yet
  useEffect(() => {
    // Only check once and when user has wallet connected
    if (hasCheckedEligibility || isLoading || !walletAddress || isPendingFailuresLoading) {
      console.log('Early return from popup check:', { 
        hasCheckedEligibility, 
        isLoading, 
        walletConnected: !!walletAddress,
        isPendingFailuresLoading
      });
      return;
    }
    
    // Don't show popup if user has pending failures in retry queue
    if (hasPendingFailures) {
      console.log('NOT showing popup - User has pending failures in retry queue');
      setHasCheckedEligibility(true);
      return;
    }
    
    console.log('Checking if should show popup:', {
      isEligible,
      hasClaimed,
      hasAddedFrame,
      hasNotifications,
      isTestUser,
      hasPendingFailures
    });
    
    // Only show popup if user is eligible, hasn't claimed already, has frame and notifications
    if (isEligible === true && !hasClaimed && hasAddedFrame && hasNotifications) {
      console.log('SHOWING POPUP - User is eligible for airdrop with all conditions met');
      
      // Short delay to show popup after page loads
      const timer = setTimeout(() => {
        console.log('Requesting airdrop popup from coordinator');
        const granted = requestPopup('airdrop');
        if (granted) {
          setShowAirdropPopup(true);
        }
        setHasCheckedEligibility(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    } else {
      console.log('NOT showing popup - One or more conditions failed');
      setHasCheckedEligibility(true);
    }
  }, [isEligible, isLoading, hasClaimed, hasCheckedEligibility, walletAddress, hasAddedFrame, hasNotifications, isTestUser, requestPopup, hasPendingFailures, isPendingFailuresLoading]);
  
  // Handle claim action
  const handleClaim = async () => {
    // Wallet should already be connected by FarcasterLogin component
    return await claimAirdrop();
  };
  
  // Close popup
  const handleClose = () => {
    console.log('Closing airdrop popup');
    setShowAirdropPopup(false);
    releasePopup('airdrop');
  };
  
  return (
    <AirdropContext.Provider
      value={{
        showAirdropPopup,
        setShowAirdropPopup,
        isEligible,
        isLoading,
        hasClaimed,
        isTestUser
      }}
    >
      {children}
      
      <AirdropClaimPopup
        isOpen={showAirdropPopup}
        onClose={handleClose}
        onClaim={handleClaim}
        isEligible={isEligible === true && !hasClaimed && hasAddedFrame && hasNotifications}
      />
    </AirdropContext.Provider>
  );
} 