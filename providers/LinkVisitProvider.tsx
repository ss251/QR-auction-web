import React, { createContext, useState, useContext, useEffect } from 'react';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { LinkVisitClaimPopup } from '@/components/LinkVisitClaimPopup';

// Define context type
interface LinkVisitContextType {
  showClaimPopup: boolean;
  setShowClaimPopup: (show: boolean) => void;
  hasClicked: boolean;
  hasClaimed: boolean;
  isLoading: boolean;
  auctionId: number;
  winningUrl: string;
  winningImage: string;
}

// Create context with default values
const LinkVisitContext = createContext<LinkVisitContextType>({
  showClaimPopup: false,
  setShowClaimPopup: () => {},
  hasClicked: false,
  hasClaimed: false,
  isLoading: true,
  auctionId: 0,
  winningUrl: '',
  winningImage: ''
});

// Hook to use the link visit context
export const useLinkVisit = () => useContext(LinkVisitContext);

export function LinkVisitProvider({ 
  children,
  auctionId,
  winningUrl,
  winningImage
}: { 
  children: React.ReactNode,
  auctionId: number,
  winningUrl: string,
  winningImage: string
}) {
  const [showClaimPopup, setShowClaimPopup] = useState(false);
  const [hasCheckedEligibility, setHasCheckedEligibility] = useState(false);
  
  const { 
    hasClicked, 
    hasClaimed, 
    isLoading, 
    walletAddress, 
    frameContext
  } = useLinkVisitEligibility(auctionId);
  
  const { claimTokens } = useLinkVisitClaim(auctionId);
  
  // Reset eligibility check when hasClicked or hasClaimed changes
  useEffect(() => {
    console.log('Link visit status changed:', { hasClicked, hasClaimed });
    if (!hasClaimed) {
      console.log('Resetting eligibility check');
      setHasCheckedEligibility(false);
    }
  }, [hasClicked, hasClaimed]);
  
  // Debug logs - exactly like in AirdropProvider
  useEffect(() => {
    console.log('===== LINK VISIT PROVIDER DEBUG =====');
    console.log('auctionId:', auctionId);
    console.log('hasClicked:', hasClicked);
    console.log('hasClaimed:', hasClaimed);
    console.log('isLoading:', isLoading);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showClaimPopup:', showClaimPopup);
    console.log('winningUrl:', winningUrl);
    console.log('frameContext?.user?.fid:', frameContext?.user?.fid);
  }, [auctionId, hasClicked, hasClaimed, isLoading, hasCheckedEligibility, walletAddress, showClaimPopup, winningUrl, frameContext]);
  
  // Show popup when user can interact with it
  useEffect(() => {
    // Only check once and when data is loaded
    if (hasCheckedEligibility || isLoading || !walletAddress) {
      console.log('Early return from popup check:', { 
        hasCheckedEligibility, 
        isLoading, 
        walletConnected: !!walletAddress 
      });
      return;
    }
    
    console.log('Checking if should show popup:', {
      hasClicked,
      hasClaimed,
      auctionId
    });
    
    // Same logic as AirdropProvider: only show popup if user hasn't claimed yet
    if (!hasClaimed) {
      console.log('SHOWING POPUP - User has not claimed tokens for this auction');
      
      // Short delay to show popup after page loads
      const timer = setTimeout(() => {
        console.log('Setting showClaimPopup to TRUE');
        setShowClaimPopup(true);
        setHasCheckedEligibility(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    } else {
      console.log('NOT showing popup - User already claimed');
      setHasCheckedEligibility(true);
    }
  }, [hasClicked, hasClaimed, isLoading, hasCheckedEligibility, walletAddress, auctionId]);
  
  // Handle claim action
  const handleClaim = async () => {
    console.log('Handling claim in provider...');
    // Wallet should already be connected
    return await claimTokens();
  };
  
  // Close popup
  const handleClose = () => {
    setShowClaimPopup(false);
  };
  
  return (
    <LinkVisitContext.Provider
      value={{
        showClaimPopup,
        setShowClaimPopup,
        hasClicked,
        hasClaimed,
        isLoading,
        auctionId,
        winningUrl,
        winningImage
      }}
    >
      {children}
      
      <LinkVisitClaimPopup
        isOpen={showClaimPopup}
        onClose={handleClose}
        hasClicked={hasClicked}
        winningUrl={winningUrl}
        winningImage={winningImage}
        auctionId={auctionId}
        onClaim={handleClaim}
      />
    </LinkVisitContext.Provider>
  );
} 