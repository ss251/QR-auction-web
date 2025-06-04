import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { useLinkVisitEligibility } from '@/hooks/useLinkVisitEligibility';
import { useLinkVisitClaim } from '@/hooks/useLinkVisitClaim';
import { LinkVisitClaimPopup } from '@/components/LinkVisitClaimPopup';
import { usePopupCoordinator } from './PopupCoordinator';
import { createClient } from "@supabase/supabase-js";
import { getAuctionImage } from '@/utils/auctionImageOverrides';
import { usePrivy, useConnectWallet } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { getFarcasterUser } from '@/utils/farcaster';
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";

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
  isTwitterUserNeedsWallet: boolean;
  isPrivyModalActive: boolean;
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
  isCheckingDatabase: false,
  isTwitterUserNeedsWallet: false,
  isPrivyModalActive: false,
});

// Hook to use the link visit context
export const useLinkVisit = () => useContext(LinkVisitContext);

interface LinkedAccount {
  type: string;
  // Add other properties as needed
}

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
  const [isWebContext, setIsWebContext] = useState(false);
  const [latestWonAuctionId, setLatestWonAuctionId] = useState<number | null>(null);
  const [isLatestWonAuction, setIsLatestWonAuction] = useState(false);
  const [latestWinningUrl, setLatestWinningUrl] = useState<string | null>(null);
  const [latestWinningImage, setLatestWinningImage] = useState<string | null>(null);
  const [manualHasClaimedLatest, setManualHasClaimedLatest] = useState<boolean | null>(null);
  const [explicitlyCheckedClaim, setExplicitlyCheckedClaim] = useState(false);
  const [isCheckingLatestAuction, setIsCheckingLatestAuction] = useState(false);
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  
  // NEW: Flag to prevent multiple wallet connection calls
  const [hasTriggeredWalletConnection, setHasTriggeredWalletConnection] = useState(false);
  
  // Web-specific state
  const { authenticated, user } = usePrivy();
  const { address: walletAddress } = useAccount();
  const { client: smartWalletClient } = useSmartWallets();
  const { connectWallet } = useConnectWallet();
  
  // Get smart wallet address from user's linked accounts (more reliable)
  const smartWalletAddress = user?.linkedAccounts?.find((account: { type: string; address?: string }) => account.type === 'smart_wallet')?.address;
  
  // Use appropriate wallet address based on context - prioritize smart wallet for web users
  const effectiveWalletAddress = isWebContext 
    ? (smartWalletAddress || smartWalletClient?.account?.address || walletAddress)
    : walletAddress;
  
  // Add state to track when wallet connection status is determined
  const [walletStatusDetermined, setWalletStatusDetermined] = useState(false);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  
  // NEW: Check if user is authenticated with Twitter or Farcaster
  const isTwitterOrFarcasterUser = useMemo(() => {
    if (!authenticated || !user?.linkedAccounts) return false;
    
    return user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'twitter_oauth' || account.type === 'farcaster'
    );
  }, [authenticated, user?.linkedAccounts]);
  
  // NEW: Check if user has traditional wallet connected (not Twitter/Farcaster)
  const hasTraditionalWalletOnly = useMemo(() => {
    if (!authenticated || !user?.linkedAccounts) return false;
    
    const hasTraditionalWallet = user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'wallet' || account.type === 'smart_wallet'
    );
    
    const hasSocialAuth = user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'twitter_oauth' || account.type === 'farcaster'
    );
    
    // Has wallet but no social auth
    return hasTraditionalWallet && !hasSocialAuth;
  }, [authenticated, user?.linkedAccounts]);
  
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
            hasWalletAddress: !!effectiveWalletAddress
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
  }, [authCheckComplete, isWebContext, authenticated, effectiveWalletAddress]);
  
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
    frameContext: eligibilityFrameContext
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
      if (!effectiveWalletAddress || !latestWonAuctionId) {
        console.log('Cannot check claim status: missing wallet address or auctionId');
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
      
      try {
        console.log(`Checking web claim status for wallet=${effectiveWalletAddress}, auctionId=${latestWonAuctionId}`);
        
        // Get Farcaster username associated with this address
        let farcasterUsername: string | null = null;
        try {
          console.log('🔍 Getting Farcaster username for address:', effectiveWalletAddress);
          const farcasterUser = await getFarcasterUser(effectiveWalletAddress);
          farcasterUsername = farcasterUser?.username || null;
          console.log('🔍 Associated Farcaster username:', farcasterUsername);
        } catch (error) {
          console.warn('Could not fetch Farcaster username for address:', error);
        }
        
        // Check for ANY claims by this wallet address for this auction (regardless of claim_source)
        const { data: allClaims, error } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('eth_address', effectiveWalletAddress)
          .eq('auction_id', latestWonAuctionId);
        
        // Also check for claims by the Farcaster username if we found one
        let usernameClaims: typeof allClaims = [];
        if (farcasterUsername) {
          console.log('🔍 Checking for username claims:', farcasterUsername);
          const { data: usernameClaimsData, error: usernameError } = await supabase
            .from('link_visit_claims')
            .select('*')
            .ilike('username', farcasterUsername)
            .eq('auction_id', latestWonAuctionId);
          
          if (!usernameError && usernameClaimsData) {
            usernameClaims = usernameClaimsData;
            console.log('🔍 Username claims found:', usernameClaims.length);
          }
        }
        
        // Combine both sets of claims and deduplicate by id
        const allClaimsArray = [...(allClaims || []), ...usernameClaims];
        const combinedClaims = allClaimsArray.filter((claim, index, self) => 
          index === self.findIndex(c => c.id === claim.id)
        );
        
        if (error) {
          console.error('Error checking web claim status:', error);
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
          return false;
        }
        
        // Check if ANY claim has claimed_at (regardless of web/mini-app source)
        const hasClaimedInAnyContext = combinedClaims && combinedClaims.some(claim => claim.claimed_at);
        
        setManualHasClaimedLatest(hasClaimedInAnyContext);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return hasClaimedInAnyContext;
      } catch (error) {
        console.error('Unexpected error checking web claim status:', error);
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
    } else {
      // Mini-app logic (existing)
      if (!effectiveWalletAddress || !eligibilityFrameContext?.user?.fid || !latestWonAuctionId) {
        console.log('Cannot check claim status: missing wallet, fid, or auctionId');
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
      
      try {
        console.log(`Checking claim status for FID=${eligibilityFrameContext.user.fid}, auctionId=${latestWonAuctionId}`);
        
        // Get the Farcaster username from frame context
        const farcasterUsername = eligibilityFrameContext.user.username;
        
        // Check for ANY claims by this wallet address for this auction (regardless of claim_source)
        const { data: allClaims, error } = await supabase
          .from('link_visit_claims')
          .select('*')
          .eq('eth_address', effectiveWalletAddress)
          .eq('auction_id', latestWonAuctionId);
        
        // Also check for claims by the Farcaster username
        let usernameClaims: typeof allClaims = [];
        if (farcasterUsername) {
          const { data: usernameClaimsData, error: usernameError } = await supabase
            .from('link_visit_claims')
            .select('*')
            .ilike('username', farcasterUsername)
            .eq('auction_id', latestWonAuctionId);
          
          if (!usernameError && usernameClaimsData) {
            usernameClaims = usernameClaimsData;
          }
        }
        
        // Combine both sets of claims and deduplicate by id
        const allClaimsArray = [...(allClaims || []), ...usernameClaims];
        const combinedClaims = allClaimsArray.filter((claim, index, self) => 
          index === self.findIndex(c => c.id === claim.id)
        );
        
        if (error) {
          console.error('Error checking claim status:', error);
          setManualHasClaimedLatest(false);
          setExplicitlyCheckedClaim(true);
          setIsCheckingDatabase(false);
          return false;
        }
        
        // Check if ANY claim has claimed_at (regardless of web/mini-app source)
        const hasClaimedInAnyContext = combinedClaims && combinedClaims.some(claim => claim.claimed_at);
        
        setManualHasClaimedLatest(hasClaimedInAnyContext);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return hasClaimedInAnyContext;
      } catch (error) {
        console.error('Unexpected error checking claim status:', error);
        setManualHasClaimedLatest(false);
        setExplicitlyCheckedClaim(true);
        setIsCheckingDatabase(false);
        return false;
      }
    }
  }, [latestWonAuctionId, effectiveWalletAddress, eligibilityFrameContext, isWebContext]);
  
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
        if (effectiveWalletAddress) {
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
      if (latestWonAuctionId && eligibilityFrameContext?.user?.fid && !explicitlyCheckedClaim && walletStatusDetermined) {
        console.log('Triggering explicit claim check for latest auction (mini-app)');
        checkClaimStatusForLatestAuction();
      }
    }
  }, [latestWonAuctionId, effectiveWalletAddress, eligibilityFrameContext, explicitlyCheckedClaim, checkClaimStatusForLatestAuction, isWebContext, walletStatusDetermined]);
  
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
  
  // NEW: Check if user is Twitter/Farcaster but needs wallet for claiming
  const isTwitterUserNeedsWallet = useMemo(() => {
    if (!isWebContext || !authenticated || !user?.linkedAccounts) return false;
    
    const hasTwitterOrFarcaster = user.linkedAccounts.some((account: LinkedAccount) => 
      account.type === 'twitter_oauth' || account.type === 'farcaster'
    );
    
    return hasTwitterOrFarcaster && !effectiveWalletAddress;
  }, [isWebContext, authenticated, user?.linkedAccounts, effectiveWalletAddress]);

  // NEW: LocalStorage flow state tracking
  const FLOW_STATE_KEY = 'qrcoin_claim_flow_state';
  
  const setFlowState = useCallback((state: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(FLOW_STATE_KEY, state);
    }
  }, []);
  
  const getFlowState = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(FLOW_STATE_KEY);
    }
    return null;
  }, []);
  
  const clearFlowState = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(FLOW_STATE_KEY);
    }
  }, []);

  // NEW: Track when user starts claim flow
  useEffect(() => {
    if (showClaimPopup && isWebContext) {
      setFlowState('claiming');
    }
  }, [showClaimPopup, isWebContext, setFlowState]);

  // NEW: Check flow state on mount - handle page reload scenarios  
  useEffect(() => {
    if (!isWebContext) return;
    
    const flowState = getFlowState();
    
    // If user was in claiming flow and now authenticated, show appropriate action
    if (flowState === 'claiming' && authenticated) {
      console.log('🔄 User returned from auth, checking wallet status for claim flow');
      
      // Small delay to ensure wallet state is determined
      setTimeout(() => {
        if (isTwitterUserNeedsWallet && !hasTriggeredWalletConnection) {
          console.log('✋ Twitter user needs wallet - triggering wallet connection (first time)');
          setHasTriggeredWalletConnection(true);
          connectWallet();
          // Don't clear flow state yet - wait for wallet to connect
        } else if (hasTriggeredWalletConnection && isTwitterUserNeedsWallet) {
          console.log('⚠️ Wallet connection already triggered, waiting for completion...');
        } else if (latestWonAuctionId && !manualHasClaimedLatest) {
          console.log('🎯 User already has wallet - showing claim popup');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
          // Clear the flow state after handling
          clearFlowState();
        }
      }, 1000);
    }
  }, [authenticated, isTwitterUserNeedsWallet, latestWonAuctionId, manualHasClaimedLatest, isWebContext, getFlowState, clearFlowState, requestPopup, connectWallet, hasTriggeredWalletConnection]);

  // Reset wallet connection flag when not in claiming flow
  useEffect(() => {
    const flowState = getFlowState();
    if (!flowState || flowState !== 'claiming') {
      setHasTriggeredWalletConnection(false);
    }
  }, [getFlowState]);

  // NEW: Listen for wallet connection completion to show claim popup
  useEffect(() => {
    if (!isWebContext) return;
    
    const flowState = getFlowState();
    
    // If user was in claiming flow, is authenticated, but previously needed wallet, and now has wallet
    if (flowState === 'claiming' && authenticated && !isTwitterUserNeedsWallet && effectiveWalletAddress) {
      console.log('🎯 Wallet connected after Twitter auth - showing claim popup');
      console.log('Wallet connection state:', { 
        flowState, 
        authenticated, 
        isTwitterUserNeedsWallet, 
        effectiveWalletAddress: !!effectiveWalletAddress,
        latestWonAuctionId,
        manualHasClaimedLatest
      });
      
      // Small delay to ensure everything is ready
      setTimeout(() => {
        if (latestWonAuctionId && !manualHasClaimedLatest) {
          console.log('🚀 Requesting claim popup from coordinator');
          const granted = requestPopup('linkVisit');
          if (granted) {
            console.log('✅ Claim popup granted and showing');
            setShowClaimPopup(true);
          } else {
            console.log('❌ Claim popup denied by coordinator');
          }
        } else {
          console.log('❌ Cannot show claim popup:', { 
            hasLatestAuctionId: !!latestWonAuctionId, 
            hasNotClaimed: !manualHasClaimedLatest 
          });
        }
        // Clear the flow state after handling
        clearFlowState();
      }, 1000); // Increased delay to ensure wallet state is fully updated
    }
  }, [isWebContext, authenticated, isTwitterUserNeedsWallet, effectiveWalletAddress, latestWonAuctionId, manualHasClaimedLatest, getFlowState, clearFlowState, requestPopup]);

  // NEW: Additional fallback - listen for any wallet address changes when in claiming flow
  useEffect(() => {
    if (!isWebContext) return;
    
    const flowState = getFlowState();
    
    // If we have flow state, user is authenticated, and wallet just became available
    if (flowState === 'claiming' && authenticated && effectiveWalletAddress && !showClaimPopup) {
      console.log('🔄 Wallet address detected during claiming flow - checking if claim popup should show');
      
      // Small delay and then check if we should show the popup
      setTimeout(() => {
        if (latestWonAuctionId && !manualHasClaimedLatest && !isPopupActive('linkVisit')) {
          console.log('🎯 Fallback: Showing claim popup after wallet address detection');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
          clearFlowState();
        }
      }, 2000);
    }
  }, [effectiveWalletAddress, isWebContext, authenticated, showClaimPopup, latestWonAuctionId, manualHasClaimedLatest, getFlowState, clearFlowState, requestPopup, isPopupActive]);
  
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
      
      // For web context, check eligibility based on authentication status
      if (isWebContext) {
        // Hide popup for traditional wallet users (coinbase, metamask, etc.)
        if (hasTraditionalWalletOnly) {
          console.log('❌ Web user has traditional wallet only, hiding popup');
          return;
        }
        
        // Show popup for disconnected users or Twitter/Farcaster users
        const shouldShow = !authenticated || isTwitterOrFarcasterUser;
        
        if (shouldShow) {
          // Use combined claim status for authenticated users
          const combinedHasClaimed = authenticated ? (manualHasClaimedLatest === true || hasClaimed) : false;
          
          // Check if user is eligible (disconnected or hasn't claimed for latest won auction)
          if ((!authenticated || !combinedHasClaimed) && latestWonAuctionId && !isLoading) {
            console.log('🎉 TRIGGERED - SHOWING WEB LINK VISIT POPUP');
            setFlowState('claiming'); // NEW: Track flow state
            const granted = requestPopup('linkVisit');
            if (granted) {
              setShowClaimPopup(true);
            }
          } else {
            console.log('❌ Triggered but web user not eligible for link visit - already claimed:', combinedHasClaimed);
          }
        } else {
          console.log('❌ Web user not eligible for popup (not disconnected or Twitter/Farcaster)');
        }
      } else {
        // Mini-app logic - use combined claim status
        const combinedHasClaimed = manualHasClaimedLatest === true || hasClaimed;
        
        if (!combinedHasClaimed && latestWonAuctionId && !isLoading) {
          console.log('🎉 TRIGGERED - SHOWING MINI-APP LINK VISIT POPUP (combined check)');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
        } else {
          console.log('❌ Triggered but mini-app user not eligible for link visit (combined status: manual=' + manualHasClaimedLatest + ', hook=' + hasClaimed + ')');
        }
      }
      setHasCheckedEligibility(true);
    };
    
    window.addEventListener('triggerLinkVisitPopup', handleTrigger);
    return () => window.removeEventListener('triggerLinkVisitPopup', handleTrigger);
  }, [manualHasClaimedLatest, latestWonAuctionId, effectiveWalletAddress, isLoading, explicitlyCheckedClaim, requestPopup, isWebContext, authenticated, walletStatusDetermined, isCheckingDatabase, hasClaimed, hasTraditionalWalletOnly, isTwitterOrFarcasterUser, setFlowState, setHasTriggeredWalletConnection]);
  
  // Show popup when user can interact with it (auto-show if eligible)
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
    
    // For web context, check eligibility based on authentication and wallet type
    if (isWebContext) {
      console.log('Checking if web user should show popup:', {
        authenticated,
        isTwitterOrFarcasterUser,
        hasTraditionalWalletOnly,
        hasClicked,
        hasClaimed,
        manualHasClaimedLatest,
        auctionId,
        latestWonAuctionId,
        effectiveWalletAddress: !!effectiveWalletAddress,
        walletStatusDetermined,
        explicitlyCheckedClaim
      });
      
      // Hide popup for traditional wallet users (coinbase, metamask, etc.)
      if (hasTraditionalWalletOnly) {
        console.log('NOT showing popup - Web user has traditional wallet only');
        setHasCheckedEligibility(true);
        return;
      }
      
      // Show popup for disconnected users or Twitter/Farcaster users
      const shouldShow = !authenticated || isTwitterOrFarcasterUser;
      
      if (shouldShow) {
        // Use combined claim status for authenticated users (disconnected users haven't claimed)
        const combinedHasClaimed = authenticated ? (manualHasClaimedLatest === true || hasClaimed) : false;
        
        // Show popup if they haven't claimed for the latest won auction or are disconnected
        if ((!authenticated || !combinedHasClaimed) && latestWonAuctionId) {
          console.log('SHOWING POPUP - Web user eligible (disconnected or Twitter/Farcaster without claim)');
          
          const timer = setTimeout(() => {
            console.log('Requesting linkVisit popup from coordinator (web)');
            setFlowState('claiming'); // NEW: Track flow state
            const granted = requestPopup('linkVisit');
            if (granted) {
              setShowClaimPopup(true);
            }
            setHasCheckedEligibility(true);
          }, 2500);
          
          return () => clearTimeout(timer);
        } else {
          if (authenticated && combinedHasClaimed) {
            console.log('NOT showing popup - Web user already claimed (combined status)');
          } else if (!latestWonAuctionId) {
            console.log('NOT showing popup - No latest won auction found');
          }
          setHasCheckedEligibility(true);
        }
      } else {
        console.log('NOT showing popup - Web user not eligible (not disconnected or Twitter/Farcaster)');
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
      
      // Use combined claim status (same as context value)
      const combinedHasClaimed = manualHasClaimedLatest === true || hasClaimed;
      
      // Only show popup if the user hasn't claimed for the latest won auction
      if (!combinedHasClaimed && latestWonAuctionId) {
        console.log('SHOWING POPUP - Mini-app user has not claimed tokens for the latest won auction (combined check)');
        
        const timer = setTimeout(() => {
          console.log('Requesting linkVisit popup from coordinator (mini-app)');
          const granted = requestPopup('linkVisit');
          if (granted) {
            setShowClaimPopup(true);
          }
          setHasCheckedEligibility(true);
        }, 1000);
        
        return () => clearTimeout(timer);
      } else {
        if (combinedHasClaimed) {
          console.log('NOT showing popup - Mini-app user already claimed (combined status: manual=' + manualHasClaimedLatest + ', hook=' + hasClaimed + ')');
        } else if (!latestWonAuctionId) {
          console.log('NOT showing popup - No latest won auction found');
        }
        setHasCheckedEligibility(true);
      }
    }
  }, [hasClicked, hasClaimed, manualHasClaimedLatest, explicitlyCheckedClaim, isLoading, hasCheckedEligibility, effectiveWalletAddress, auctionId, latestWonAuctionId, isCheckingLatestAuction, isWebContext, authenticated, walletStatusDetermined, isCheckingDatabase, hasTraditionalWalletOnly, isTwitterOrFarcasterUser, setFlowState]);
  
  // NEW: Track when Privy modal is active to prevent popup interference
  const [isPrivyModalActive, setIsPrivyModalActive] = useState(false);
  
  // Monitor Privy connection state to detect when modal is active
  useEffect(() => {
    if (hasTriggeredWalletConnection && isTwitterUserNeedsWallet && !effectiveWalletAddress) {
      setIsPrivyModalActive(true);
      console.log('🔒 Privy modal active - protecting claim popup');
    } else if (authenticated && effectiveWalletAddress) {
      // Immediately clear when wallet connection completes
      setIsPrivyModalActive(false);
      console.log('🔓 Privy modal closed - claim popup safe');
    } else if (!isTwitterUserNeedsWallet) {
      // Clear if user no longer needs wallet
      setIsPrivyModalActive(false);
    }
  }, [hasTriggeredWalletConnection, isTwitterUserNeedsWallet, authenticated, effectiveWalletAddress]);
  
  // Cleanup Privy modal state when popup closes
  useEffect(() => {
    if (!showClaimPopup) {
      setIsPrivyModalActive(false);
    }
  }, [showClaimPopup]);

  // Handle claim action
  const handleClaim = async (captchaToken: string) => {
    console.log('Handling claim in provider...', { claimAuctionId, isWebContext, captchaToken: captchaToken || 'none' });
    
    // For web context, wallet should already be connected via authentication check
    // For mini-app context, wallet should already be connected as before
    const result = await claimTokens(captchaToken || undefined);
    
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
    clearFlowState();
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
        isCheckingDatabase,
        isTwitterUserNeedsWallet,
        isPrivyModalActive
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
        isPrivyModalActive={isPrivyModalActive}
      />
    </LinkVisitContext.Provider>
  );
} 