import React, { createContext, useState, useContext, useEffect } from 'react';
import { useLikesRecastsEligibility } from '@/hooks/useLikesRecastsEligibility';
import { LikesRecastsClaimPopup } from '@/components/LikesRecastsClaimPopup';

// Define context type
interface LikesRecastsContextType {
  showLikesRecastsPopup: boolean;
  setShowLikesRecastsPopup: (show: boolean) => void;
  isEligible: boolean | null;
  isLoading: boolean;
  hasClaimedEither: boolean;
}

// Create context with default values
const LikesRecastsContext = createContext<LikesRecastsContextType>({
  showLikesRecastsPopup: false,
  setShowLikesRecastsPopup: () => {},
  isEligible: null,
  isLoading: true,
  hasClaimedEither: false,
});

// Hook to use the likes/recasts context
export const useLikesRecasts = () => useContext(LikesRecastsContext);

interface LikesRecastsProviderProps {
  children: React.ReactNode;
  onPopupComplete?: () => void; // Callback when this popup is done
}

export function LikesRecastsProvider({ children, onPopupComplete }: LikesRecastsProviderProps) {
  const [showLikesRecastsPopup, setShowLikesRecastsPopup] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);
  
  const { 
    isEligible, 
    isLoading, 
    hasClaimedEither,
    hasSignerApproval,
    walletAddress
  } = useLikesRecastsEligibility();
  
  // Debug logs
  useEffect(() => {
    console.log('===== LIKES/RECASTS PROVIDER DEBUG =====');
    console.log('isEligible:', isEligible);
    console.log('isLoading:', isLoading);
    console.log('hasClaimedEither:', hasClaimedEither);
    console.log('hasSignerApproval:', hasSignerApproval);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showLikesRecastsPopup:', showLikesRecastsPopup);
  }, [isEligible, isLoading, hasClaimedEither, hasSignerApproval, hasCheckedEligibility, walletAddress, showLikesRecastsPopup]);
  
  // Reset eligibility check when wallet address changes or eligibility is being recalculated
  useEffect(() => {
    if (walletAddress && isLoading) {
      console.log('Resetting hasCheckedEligibility - eligibility being recalculated');
      setHasCheckedEligibility(false);
    }
  }, [walletAddress, isLoading]);
  
  // Auto-show popup when user is eligible
  useEffect(() => {
    console.log('===== LIKES/RECASTS AUTO-SHOW CHECK =====', {
      hasCheckedEligibility,
      isLoading,
      walletAddress,
      showLikesRecastsPopup,
      isEligible,
      hasClaimedEither,
      hasSignerApproval
    });
    
    // Skip if already checked or still loading
    if (hasCheckedEligibility) {
      console.log('SKIPPING: Already checked eligibility');
      return;
    }
    
    if (isLoading) {
      console.log('SKIPPING: Still loading');
      return;
    }
    
    if (!walletAddress) {
      console.log('SKIPPING: No wallet address');
      return;
    }
    
    // Skip if popup is already showing (to avoid conflicts with manual triggering)
    if (showLikesRecastsPopup) {
      console.log('SKIPPING: Popup already showing');
      return;
    }
    
    // Skip if eligibility is still being determined (null)
    if (isEligible === null) {
      console.log('SKIPPING: Eligibility still being determined (null)');
      return;
    }
    
    // Show popup if user is eligible and hasn't claimed
    if (isEligible === true && !hasClaimedEither) {
      // Show popup whether they have signer approval or not
      // If they have approval, the popup will skip to claim state
      // If they don't have approval, the popup will start with permissions
      console.log('🎉 ALL CONDITIONS MET - SHOWING LIKES/RECASTS POPUP');
      console.log('Has signer approval:', hasSignerApproval);
      
      const timer = setTimeout(() => {
        console.log('Timer fired - setting popup to show');
        // Double-check popup isn't already showing before setting it
        setShowLikesRecastsPopup(prev => {
          if (prev) {
            console.log('Popup already showing, not changing');
            return prev;
          }
          console.log('Setting popup to show!');
          return true;
        });
        setHasCheckedEligibility(true);
      }, 1500); // Show after 1.5 seconds
      
      return () => {
        console.log('Cleaning up timer');
        clearTimeout(timer);
      };
    } else if (isEligible === false) {
      // Only set as checked if user is definitely not eligible
      console.log('❌ User is not eligible for likes/recasts popup');
      setHasCheckedEligibility(true);
    } else if (hasClaimedEither) {
      console.log('❌ User has already claimed either option');
      setHasCheckedEligibility(true);
    } else {
      console.log('❓ Unknown condition preventing popup');
    }
  }, [isEligible, isLoading, hasClaimedEither, hasSignerApproval, hasCheckedEligibility, walletAddress, showLikesRecastsPopup]);
  
  // This provider will be triggered by the main AirdropProvider
  // It won't auto-show the popup, but will wait to be told when to show
  useEffect(() => {
    // When popup is closed, notify parent
    if (!showLikesRecastsPopup && hasCheckedEligibility && onPopupComplete) {
      onPopupComplete();
    }
  }, [showLikesRecastsPopup, hasCheckedEligibility, onPopupComplete]);
  
  // Mark as checked when popup is shown
  useEffect(() => {
    if (showLikesRecastsPopup && !hasCheckedEligibility) {
      setHasCheckedEligibility(true);
    }
  }, [showLikesRecastsPopup, hasCheckedEligibility]);
  
  // Close popup
  const handleClose = () => {
    setShowLikesRecastsPopup(false);
  };
  
  return (
    <LikesRecastsContext.Provider
      value={{
        showLikesRecastsPopup,
        setShowLikesRecastsPopup,
        isEligible,
        isLoading,
        hasClaimedEither
      }}
    >
      {children}
      
      <LikesRecastsClaimPopup
        isOpen={showLikesRecastsPopup}
        onClose={handleClose}
        hasAlreadyClaimed={hasClaimedEither}
      />
    </LikesRecastsContext.Provider>
  );
} 