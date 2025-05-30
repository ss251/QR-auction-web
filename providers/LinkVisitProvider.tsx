import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { LinkVisitClaimPopup } from '@/components/LinkVisitClaimPopup';
import { usePopupCoordinator } from './PopupCoordinator';
import { createClient } from "@supabase/supabase-js";
import { getAuctionImage } from '@/utils/auctionImageOverrides';
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

// Initialize Supabase client once, outside the component
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  isLatestWonAuction: boolean;
  latestWonAuctionId: number | null;
  isWebContext: boolean;
  needsWalletConnection: boolean;
  walletStatusDetermined: boolean;
  authCheckComplete: boolean;
  isCheckingDatabase: boolean;
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
  winningImage: '',
  isLatestWonAuction: false,
  latestWonAuctionId: null,
  isWebContext: false,
  needsWalletConnection: false,
  walletStatusDetermined: false,
  authCheckComplete: false,
  isCheckingDatabase: false
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
  const [isLatestWonAuction, setIsLatestWonAuction] = useState(false);
  const [isCheckingLatestAuction, setIsCheckingLatestAuction] = useState(true);
  const [latestWonAuctionId, setLatestWonAuctionId] = useState<number | null>(null);
  const [latestWinningUrl, setLatestWinningUrl] = useState<string>('');
  const [latestWinningImage, setLatestWinningImage] = useState<string>('');
  const [manualHasClaimedLatest, setManualHasClaimedLatest] = useState<boolean | null>(null);
  const [explicitlyCheckedClaim, setExplicitlyCheckedClaim] = useState(false);
  const [isWebContext, setIsWebContext] = useState(false);
  
  // Web-specific state
  const { authenticated } = usePrivy();
  const { address: walletAddress } = useAccount();
  
  // Add state to track when wallet connection status is determined
  const [walletStatusDetermined, setWalletStatusDetermined] = useState(false);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  
  // Get popup coordinator to manage popup display
  const { requestPopup, releasePopup, isPopupActive } = usePopupCoordinator();

  // Detect if we're in web context vs mini-app context
  useEffect(() => {
    async function detectContext() {
      try {
        // Try to get frame context - if this fails, we're in web context
        const { frameSdk } = await import('@/lib/frame-sdk');
        const context = await frameSdk.getContext();
        setIsWebContext(!context?.user?.fid);
      } catch (error) {
        console.error("Error detecting context:", error);
        // If frameSdk fails, we're definitely in web context
        setIsWebContext(true);
      }
    }
    
    detectContext();
  }, []);

  // For web context, we need to check if wallet is connected
  const needsWalletConnection = isWebContext && !authenticated;
  
  // Track when authentication status is determined (either true or false, but resolved)
  useEffect(() => {
    if (isWebContext) {
      // For web context, we need to wait for Privy to finish initialization
      // After a reasonable delay, consider auth status as determined
      const timer = setTimeout(() => {
        setAuthCheckComplete(true);
        console.log('Auth check complete, authenticated:', authenticated);
      }, 3000); // Give Privy 3 seconds to initialize
      
      return () => clearTimeout(timer);
    } else {
      // For mini-app context, we don't rely on Privy auth
      setAuthCheckComplete(true);
    }
  }, [isWebContext, authenticated]);
  
  // Track when wallet connection status is determined
  useEffect(() => {
    if (!authCheckComplete) return;
    
    if (isWebContext) {
      if (authenticated) {
        // If authenticated, wait for wallet address or determine it's not available
        const timer = setTimeout(() => {
          setWalletStatusDetermined(true);
          console.log('Wallet status determined - authenticated user:', {
            authenticated,
            hasWalletAddress: !!walletAddress
          });
        }, 2000); // Wait 2 seconds for wallet address to resolve
        
        return () => clearTimeout(timer);
      } else {
        // If not authenticated, wallet status is immediately known (not connected)
        setWalletStatusDetermined(true);
        console.log('Wallet status determined - not authenticated');
      }
    } else {
      // For mini-app context, wallet status depends on frameContext
      setWalletStatusDetermined(true);
    }
  }, [authCheckComplete, isWebContext, authenticated, walletAddress]);
  
  // Sync local state with coordinator state
  useEffect(() => {
    const isActive = isPopupActive('linkVisit');
    if (isActive !== showClaimPopup) {
      setShowClaimPopup(isActive);
    }
  }, [isPopupActive, showClaimPopup]);
  
  // Use the latestWonAuctionId for eligibility checks, falling back to current auction
  const eligibilityAuctionId = latestWonAuctionId !== null ? latestWonAuctionId : auctionId;
  
  const { 
    hasClicked, 
    hasClaimed, 
    isLoading, 
    frameContext
  } = useLinkVisitEligibility(eligibilityAuctionId, isWebContext);
  
  // ALWAYS use the latestWonAuctionId for claim operations - never fall back to current auction
  // This prevents gaming by manually visiting future auction URLs
  const claimAuctionId = latestWonAuctionId;
  const { claimTokens } = useLinkVisitClaim(claimAuctionId || 0, isWebContext);

  // Explicit function to check claim status directly from database
  const checkClaimStatusForLatestAuction = useCallback(async () => {
    console.log('Explicitly checking claim status for latest auction');
    setIsCheckingDatabase(true);
    
    // For web context, use wallet address; for mini-app, use FID
    if (isWebContext) {
      if (!walletAddress || !latestWonAuctionId) {
        console.log('Cannot check claim status: missing wallet address or auctionId');
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
      
      try {
        console.log(`Checking web claim status for wallet=${walletAddress}, auctionId=${latestWonAuctionId}`);
        
        // Direct DB query to check if claimed for web users
        const { data, error } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('eth_address', walletAddress)
          .eq('auction_id', latestWonAuctionId)
          .eq('claim_source', 'web')
          .maybeSingle();
        
        console.log('🔍 DATABASE QUERY DETAILS:');
        console.log('  - Table: link_visit_claims');
        console.log('  - eth_address:', walletAddress);
        console.log('  - auction_id:', latestWonAuctionId);
        console.log('  - claim_source: web');
        console.log('  - Query error:', error);
        console.log('  - Query result:', data);
        
        // Also check for ANY claims by this wallet address for this auction (debug)
        const { data: allClaims } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('eth_address', walletAddress)
          .eq('auction_id', latestWonAuctionId);
        
        console.log('🔍 ALL CLAIMS FOR THIS WALLET/AUCTION:', allClaims);
        
        // Check for case sensitivity issues with wallet address (addresses should be case-insensitive)
        const { data: caseInsensitiveClaims } = await supabase
          .from('link_visit_claims')
          .select('*')
          .ilike('eth_address', walletAddress)
          .eq('auction_id', latestWonAuctionId);
        
        console.log('🔍 CASE-INSENSITIVE WALLET CLAIMS:', caseInsensitiveClaims);
        
        if (error) {
          console.error('Error checking web claim status:', error);
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
          return false;
        }
        
        // Determine if user has claimed based on claimed_at field
        const hasClaimed = !!(data && data.claimed_at);
        console.log('🎯 FINAL CLAIM STATUS:', { 
          hasClaimed, 
          hasRecord: !!data,
          hasClaimedAt: !!(data?.claimed_at),
          record: data 
        });
        
        console.log('📊 SUMMARY OF ALL QUERIES:');
        console.log('  1. Web-specific query (claim_source=web):', data ? 'FOUND' : 'NOT FOUND');
        console.log('  2. All claims for wallet/auction:', allClaims?.length || 0, 'records');
        console.log('  3. Case-insensitive claims:', caseInsensitiveClaims?.length || 0, 'records');
        
        // If no web-specific claim but other claims exist, log details
        if (!data && ((allClaims && allClaims.length > 0) || (caseInsensitiveClaims && caseInsensitiveClaims.length > 0))) {
          console.log('⚠️ NO WEB CLAIM FOUND BUT OTHER CLAIMS EXIST:');
          if (allClaims && allClaims.length > 0) {
            allClaims.forEach((claim, index) => {
              console.log(`  Claim ${index + 1}:`, {
                claim_source: claim.claim_source,
                eth_address: claim.eth_address,
                claimed_at: claim.claimed_at,
                tx_hash: claim.tx_hash
              });
            });
          }
        }
        
        setManualHasClaimedLatest(hasClaimed);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return hasClaimed;
      } catch (error) {
        console.error('Unexpected error checking web claim status:', error);
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
    } else {
      // Mini-app logic (existing)
      if (!walletAddress || !frameContext?.user?.fid || !latestWonAuctionId) {
        console.log('Cannot check claim status: missing wallet, fid, or auctionId');
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
      
      try {
        console.log(`Checking claim status for FID=${frameContext.user.fid}, auctionId=${latestWonAuctionId}`);
        
        // Direct DB query to check if claimed
        const { data, error } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('fid', frameContext.user.fid)
          .eq('auction_id', latestWonAuctionId)
          .eq('claim_source', 'mini_app')
          .maybeSingle();
        
        if (error) {
          console.error('Error checking claim status:', error);
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
          return false;
        }
        
        // Determine if user has claimed based on claimed_at field
        const hasClaimed = !!(data && data.claimed_at);
        console.log('Explicit claim check result:', { hasClaimed, record: data });
        
        setManualHasClaimedLatest(hasClaimed);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return hasClaimed;
      } catch (error) {
        console.error('Unexpected error checking claim status:', error);
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
    }
  }, [latestWonAuctionId, walletAddress, frameContext, isWebContext]);
  
  // Check if this auction is the latest won auction using Supabase
  useEffect(() => {
    async function checkLatestWonAuction() {
      try {
        setIsCheckingLatestAuction(true);
        setExplicitlyCheckedClaim(false); // Reset claim check flag when getting new auction data
        
        // Query the winners table to get the latest auction
        const { data: latestWinner, error } = await supabase
          .from('winners')
          .select('token_id, url')
          .order('token_id', { ascending: false })
          .limit(1);
        
        if (error) {
          console.error('Error fetching latest won auction:', error);
          return;
        }
        
        if (latestWinner && latestWinner.length > 0) {
          const latestTokenId = parseInt(latestWinner[0].token_id);
          setLatestWonAuctionId(latestTokenId);
          
          // Set the winning URL from the winner data
          if (latestWinner[0].url) {
            setLatestWinningUrl(latestWinner[0].url);
          }
          
          // Check if we have a hardcoded image for this auction ID
          const tokenIdStr = latestTokenId.toString();
          // Use the utility function to get the image
          const overrideImage = await getAuctionImage(tokenIdStr);
          if (overrideImage) {
            setLatestWinningImage(overrideImage);
          } else {
            // If no override exists, fetch from OG API
            try {
              const url = latestWinner[0].url || '';
              const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
              const data = await res.json();
              
              if (data.error || !data.image) {
                setLatestWinningImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
              } else {
                setLatestWinningImage(data.image);
              }
            } catch (err) {
              console.error('Error fetching OG image:', err);
              setLatestWinningImage(`${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`);
            }
          }
          
          // Current auction is eligible if it's the won auction or the next one
          const isLatest = auctionId === latestTokenId || auctionId === latestTokenId + 1;
          console.log(`Auction ${auctionId} is${isLatest ? '' : ' not'} eligible (latest won auction: ${latestTokenId})`);
          setIsLatestWonAuction(isLatest);
        } else {
          console.log('No won auctions found');
          setIsLatestWonAuction(false);
          setLatestWonAuctionId(null);
        }
      } catch (error) {
        console.error('Error checking latest won auction:', error);
      } finally {
        setIsCheckingLatestAuction(false);
      }
    }
    
    checkLatestWonAuction();
  }, [auctionId]);
  
  // Perform explicit claim check when we get latest auction ID and wallet/frame context
  useEffect(() => {
    // Only perform check if we have all necessary data and haven't checked yet
    if (isWebContext) {
      // Web context: check when wallet status is determined
      if (latestWonAuctionId && !explicitlyCheckedClaim && walletStatusDetermined) {
        if (walletAddress) {
          console.log('Triggering explicit claim check for latest auction (web - authenticated)');
          checkClaimStatusForLatestAuction();
        } else {
          // No wallet address (not authenticated), assume no previous claim
          console.log('Web user not authenticated, assuming no previous claim');
          setIsCheckingDatabase(true);
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
        }
      }
    } else {
      // Mini-app context: check when we have frame context and wallet status is determined
      if (latestWonAuctionId && frameContext?.user?.fid && !explicitlyCheckedClaim && walletStatusDetermined) {
        console.log('Triggering explicit claim check for latest auction (mini-app)');
        checkClaimStatusForLatestAuction();
      }
    }
  }, [latestWonAuctionId, walletAddress, frameContext, explicitlyCheckedClaim, checkClaimStatusForLatestAuction, isWebContext, walletStatusDetermined]);
  
  // Reset eligibility check when hasClicked or hasClaimed or manualHasClaimedLatest changes
  useEffect(() => {
    console.log('Link visit status changed:', { 
      hasClicked, 
      hasClaimed, 
      manualHasClaimedLatest 
    });
    
    if (!hasClaimed && manualHasClaimedLatest !== true) {
      console.log('Resetting eligibility check');
      setHasCheckedEligibility(false);
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest]);
  
  // Debug logs
  useEffect(() => {
    console.log('===== LINK VISIT PROVIDER DEBUG =====');
    console.log('auctionId:', auctionId);
    console.log('claimAuctionId (for recording claims):', claimAuctionId);
    console.log('latestWonAuctionId:', latestWonAuctionId);
    console.log('latestWinningUrl:', latestWinningUrl);
    console.log('latestWinningImage:', latestWinningImage);
    console.log('hasClicked:', hasClicked);
    console.log('hasClaimed:', hasClaimed);
    console.log('manualHasClaimedLatest:', manualHasClaimedLatest);
    console.log('explicitlyCheckedClaim:', explicitlyCheckedClaim); 
    console.log('isLoading:', isLoading);
    console.log('hasCheckedEligibility:', hasCheckedEligibility);
    console.log('walletAddress:', walletAddress);
    console.log('showClaimPopup:', showClaimPopup);
    console.log('frameContext?.user?.fid:', frameContext?.user?.fid);
    console.log('isLatestWonAuction:', isLatestWonAuction);
    console.log('isCheckingLatestAuction:', isCheckingLatestAuction);
    console.log('isPopupActive:', isPopupActive('linkVisit'));
    console.log('isWebContext:', isWebContext);
    console.log('needsWalletConnection:', needsWalletConnection);
    console.log('authenticated:', authenticated);
    console.log('authCheckComplete:', authCheckComplete);
    console.log('walletStatusDetermined:', walletStatusDetermined);
    console.log('isCheckingDatabase:', isCheckingDatabase);
  }, [auctionId, claimAuctionId, latestWonAuctionId, latestWinningUrl, latestWinningImage, 
      hasClicked, hasClaimed, manualHasClaimedLatest, explicitlyCheckedClaim, isLoading, 
      hasCheckedEligibility, walletAddress, showClaimPopup, frameContext, isLatestWonAuction, 
      isCheckingLatestAuction, isPopupActive, isWebContext, needsWalletConnection, authenticated, authCheckComplete, walletStatusDetermined, isCheckingDatabase]);
  
  // Listen for trigger from other popups closing
  useEffect(() => {
    const handleTrigger = () => {
      console.log('===== LINK VISIT TRIGGERED BY OTHER POPUP =====');
      
      // Don't show popup if wallet status hasn't been determined yet
      if (!walletStatusDetermined) {
        console.log('❌ Triggered but wallet status not determined yet');
        return;
      }
      
      // Don't show popup if database check hasn't been completed yet
      if (!explicitlyCheckedClaim) {
        console.log('❌ Triggered but database claim check not completed yet');
        return;
      }
      
      // Don't show popup if database check is still in progress
      if (isCheckingDatabase) {
        console.log('❌ Triggered but database check still in progress');
        return;
      }
      
      // For web context, we need to ensure user is authenticated first
      if (isWebContext) {
        if (!authenticated) {
          console.log('❌ Web user not authenticated, cannot show popup');
          return;
        }
        
        // Use combined claim status (same logic as context value and popup logic)
        const combinedHasClaimed = manualHasClaimedLatest === true || hasClaimed;
        
        // Check if user is eligible (hasn't claimed for latest won auction)
        if (!combinedHasClaimed && latestWonAuctionId && walletAddress && !isLoading) {
          console.log('🎉 TRIGGERED - SHOWING WEB LINK VISIT POPUP');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
        } else {
          console.log('❌ Triggered but web user not eligible for link visit - combined claim status:', combinedHasClaimed);
        }
      } else {
        // Mini-app logic (existing)
        if (manualHasClaimedLatest === false && latestWonAuctionId && !isLoading) {
          console.log('🎉 TRIGGERED - SHOWING MINI-APP LINK VISIT POPUP');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
        } else {
          console.log('❌ Triggered but mini-app user not eligible for link visit');
        }
      }
      setHasCheckedEligibility(true);
    };
    
    window.addEventListener('triggerLinkVisitPopup', handleTrigger);
    return () => window.removeEventListener('triggerLinkVisitPopup', handleTrigger);
  }, [manualHasClaimedLatest, latestWonAuctionId, walletAddress, isLoading, explicitlyCheckedClaim, requestPopup, isWebContext, authenticated, walletStatusDetermined, isCheckingDatabase, hasClaimed]);
  
  // Show popup when user can interact with it (ENABLED - shows independently if eligible)
  useEffect(() => {
    // LinkVisit popup can now auto-show if user is eligible
    console.log('LinkVisit auto-show is enabled - checking eligibility independently');
    
    // Ensure we have explicitly checked claim status before showing popup
    if (!explicitlyCheckedClaim) {
      console.log('Not showing popup - explicit claim check not completed yet');
      return;
    }
    
    // Wait for wallet status to be determined before showing popup
    if (!walletStatusDetermined) {
      console.log('Not showing popup - wallet status not determined yet');
      return;
    }
    
    // Wait for database check to complete before showing popup
    if (isCheckingDatabase) {
      console.log('Not showing popup - still checking database for existing claims');
      return;
    }
    
    // Only check once and when data is loaded
    if (hasCheckedEligibility || isLoading || isCheckingLatestAuction) {
      console.log('Early return from popup check:', { 
        hasCheckedEligibility, 
        isLoading, 
        isCheckingLatestAuction
      });
      return;
    }
    
    // For web context, need authentication first
    if (isWebContext) {
      console.log('Checking if web user should show popup:', {
        hasClicked,
        hasClaimed,
        manualHasClaimedLatest,
        auctionId,
        latestWonAuctionId,
        authenticated,
        walletAddress: !!walletAddress,
        walletStatusDetermined,
        explicitlyCheckedClaim
      });
      
      // Use combined claim status (same logic as context value)
      const combinedHasClaimed = manualHasClaimedLatest === true || hasClaimed;
      
      // Show popup if they haven't claimed for the latest won auction
      // Only show after we've determined wallet status and checked database
      if (!combinedHasClaimed && latestWonAuctionId) {
        console.log('SHOWING POPUP - Web user eligible (wallet status determined, no existing claim found)');
        
        // Shorter delay since we've already waited for status determination
        const timer = setTimeout(() => {
          console.log('Requesting linkVisit popup from coordinator (web)');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
          setHasCheckedEligibility(true);
        }, 2000); // Reduced delay since we already waited for status
        
        return () => clearTimeout(timer);
      } else {
        if (combinedHasClaimed) {
          console.log('NOT showing popup - Web user already claimed (combined status)');
        } else if (!latestWonAuctionId) {
          console.log('NOT showing popup - No latest won auction found');
        }
        setHasCheckedEligibility(true);
      }
    } else {
      // Mini-app logic (existing)
      console.log('Checking if mini-app user should show popup:', {
        hasClicked,
        hasClaimed,
        manualHasClaimedLatest,
        auctionId,
        latestWonAuctionId,
      });
      
      // Only show popup if the user hasn't claimed for the latest won auction
      if (manualHasClaimedLatest === false && latestWonAuctionId) {
        console.log('SHOWING POPUP - Mini-app user has not claimed tokens for the latest won auction');
        
        // Shorter delay since we've already waited for status determination
        const timer = setTimeout(() => {
          console.log('Requesting linkVisit popup from coordinator (mini-app)');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
          setHasCheckedEligibility(true);
        }, 500); // Reduced delay
        
        return () => clearTimeout(timer);
      } else {
        if (manualHasClaimedLatest === true) {
          console.log('NOT showing popup - Mini-app user already claimed (confirmed with DB)');
        } else if (!latestWonAuctionId) {
          console.log('NOT showing popup - No latest won auction found');
        }
        setHasCheckedEligibility(true);
      }
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest, explicitlyCheckedClaim, isLoading, hasCheckedEligibility, walletAddress, auctionId, latestWonAuctionId, isCheckingLatestAuction, isWebContext, authenticated, walletStatusDetermined, isCheckingDatabase]);
  
  // Handle claim action
  const handleClaim = async () => {
    console.log('Handling claim in provider...', { claimAuctionId, isWebContext });
    
    // For web context, wallet should already be connected via authentication check
    // For mini-app context, wallet should already be connected as before
    const result = await claimTokens();
    
    // Update our manual tracking state after claim
    if (result.txHash) {
      setManualHasClaimedLatest(true);
    }
    
    return result;
  };
  
  // Close popup
  const handleClose = () => {
    console.log('Closing link visit popup');
    setShowClaimPopup(false);
    releasePopup('linkVisit');
  };
  
  return (
    <LinkVisitContext.Provider
      value={{
        showClaimPopup,
        setShowClaimPopup,
        hasClicked,
        hasClaimed: manualHasClaimedLatest === true || hasClaimed, // Use combined claim status
        isLoading,
        auctionId,
        winningUrl,
        winningImage,
        isLatestWonAuction,
        latestWonAuctionId,
        isWebContext,
        needsWalletConnection,
        walletStatusDetermined,
        authCheckComplete,
        isCheckingDatabase
      }}
    >
      {children}
      
      <LinkVisitClaimPopup
        isOpen={showClaimPopup}
        onClose={handleClose}
        hasClicked={hasClicked}
        winningUrl={latestWinningUrl || winningUrl}
        winningImage={latestWinningImage || winningImage}
        auctionId={claimAuctionId || 0}
        onClaim={handleClaim}
      />
    </LinkVisitContext.Provider>
  );
} 