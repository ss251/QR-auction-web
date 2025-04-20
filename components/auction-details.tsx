/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

import { useCountdown } from "@/hooks/useCountdown";
import { BidHistoryDialog } from "./bid-history-dialog";
import { formatEther, formatUnits } from "viem";
import { HowItWorksDialog } from "./HowItWorksDialog";

import { useFetchSettledAuc } from "@/hooks/useFetchSettledAuc";
import { useFetchAuctionDetails } from "@/hooks/useFetchAuctionDetails";
import { useFetchAuctionSettings } from "@/hooks/useFetchAuctionSettings";
import { useWriteActions } from "@/hooks/useWriteActions";
import { waitForTransactionReceipt } from "@wagmi/core";
import { toast } from "sonner";
import { wagmiConfig } from "@/config/wagmiConfig";
import { BidForm } from "@/components/bid-amount-view";
import { WinDetailsView } from "@/components/WinDetailsView";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "wagmi";
import { useSafetyDialog } from "@/hooks/useSafetyDialog";
import { SafetyDialog } from "./SafetyDialog";
import { formatQRAmount, formatUsdValue } from "@/utils/formatters";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { getFarcasterUser } from "@/utils/farcaster";
import { WarpcastLogo } from "@/components/WarpcastLogo";
import { useAuctionEvents, registerTransaction } from "@/hooks/useAuctionEvents";
import { useBaseColors } from "@/hooks/useBaseColors";
import { TypingIndicator } from "./TypingIndicator";
import { useWhitelistStatus } from "@/hooks/useWhitelistStatus";
import { Address } from "viem";

interface AuctionDetailsProps {
  id: number;
  onPrevious: () => void;
  onNext: () => void;
  isLatest: boolean;
}

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
};

type NameInfo = {
  displayName: string;
  farcasterUsername: string | null;
  basename: string | null;
  pfpUrl: string | null;
};

export function AuctionDetails({
  id,
  onPrevious,
  onNext,
  isLatest,
}: AuctionDetailsProps) {
  const [showBidHistory, setShowBidHistory] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [settledAuctions, setSettledAcustions] = useState<AuctionType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bidderNameInfo, setBidderNameInfo] = useState<NameInfo>({
    displayName: "",
    farcasterUsername: null,
    basename: null,
    pfpUrl: null
  });

  const { fetchHistoricalAuctions: auctionsSettled } = useFetchSettledAuc(BigInt(id));
  const { refetch, auctionDetail, contractReadError } = useFetchAuctionDetails(BigInt(id));
  const { refetchSettings, settingDetail, error: settingsError } = useFetchAuctionSettings(BigInt(id));

  const { settleTxn } = useWriteActions({ tokenId: BigInt(id) });
  const { isConnected, address } = useAccount();
  const { time, isComplete } = useCountdown(
    auctionDetail?.endTime ? Number(auctionDetail.endTime) : 0
  );
  const isBaseColors = useBaseColors();

  const { priceUsd: qrPrice, formatAmountToUsd } = useTokenPrice();

  const { isOpen, pendingUrl, openDialog, closeDialog, handleContinue } =
    useSafetyDialog();

  const { isWhitelisted, isLoading: whitelistLoading } = useWhitelistStatus(address as Address);

  const currentSettledAuction = settledAuctions.find((val) => {
    return Number(val.tokenId) === id;
  });

  const qrTokenAmount = Number(formatEther(auctionDetail?.highestBid ?? 0n));
  const usdBalance = qrPrice ? qrTokenAmount * qrPrice : 0;

  // Check if this is auction #22 from v1 contract
  const isAuction22 = id === 22;
  // Check if auction is from legacy contract (1-22)
  const isLegacyAuction = id <= 22;
  // Check if this is the last auction in its contract
  const isLastInContract = isLegacyAuction ? id === 22 : isLatest;

  const isAuction36 = id === 36;
  const isV2Auction = id >= 23 && id <= 35;
  const isV3Auction = id >= 36;

  // Add state to track fetch errors
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleSettle = useCallback(async () => {
    console.log(`[DEBUG] handleSettle called, isComplete: ${isComplete}, isWhitelisted: ${isWhitelisted}, isV3Auction: ${isV3Auction}`);
    console.log(`[DEBUG] Whitelist check for ${address}: isWhitelisted=${isWhitelisted}, isLoading=${whitelistLoading}`);
    
    if (!isComplete) {
      return;
    }

    if (!isConnected) {
      toast.error("Connect a wallet");
      return;
    }
    
    // Only allow settlement of V3 auctions
    if (!isV3Auction) {
      toast.error("Only V3 auctions (36+) can be settled. Previous auctions are read-only.");
      return;
    }

    if (!isWhitelisted) {
      console.error(`[DEBUG] Settlement blocked: Address ${address} is not whitelisted in contract ${process.env.NEXT_PUBLIC_QRAuctionV3}`);
      toast.error("Only whitelisted settlers can settle auctions");
      return;
    }

    try {
      console.log(`[DEBUG] Calling settleTxn...`);
      const hash = await settleTxn();
      console.log(`[DEBUG] Received transaction hash: ${hash}`);
      
      // Register the transaction hash to prevent duplicate toasts
      registerTransaction(hash);

      const transactionReceiptPr = waitForTransactionReceipt(wagmiConfig, {
        hash: hash,
      });

      toast.promise(transactionReceiptPr, {
        loading: "Executing Transaction...",
        success: async (data: any) => {
          console.log(`[DEBUG] Transaction successful, receipt:`, data);
          // After successful transaction, send notifications
          try {
            // Skip notifications in development environment
            const isDev = process.env.NODE_ENV === 'development';
            
            if (isDev) {
              console.log('[DEV MODE] Skipping notifications in development environment');
              return "New Auction Created";
            }
            
            if (auctionDetail?.highestBidder) {
              console.log(`[DEBUG] Winner address: ${auctionDetail.highestBidder}`);
              // Check if this is a zero address (auction with no bids)
              const isZeroAddress = auctionDetail.highestBidder === '0x0000000000000000000000000000000000000000';
              
              if (isZeroAddress) {
                console.log(`[Settle] Auction #${id} settled with no bids (zero address winner). Skipping notifications.`);
                return "New Auction Created";
              }
            
              // Get bidder name for notification
              const winnerName = bidderNameInfo.displayName || auctionDetail.highestBidder;
              
              console.log(`[Settle] Sending notifications for auction #${id} won by ${winnerName}`);

              // First, try to get the winner's FID so we can exclude them from the general notification
              let winnerFid: number | null = null;
              
              try {
                // Look up winner's FID first, so we can exclude them from the general notification
                console.log(`[Settle] Looking up winner's FID for address ${auctionDetail.highestBidder}`);
                const farcasterUser = await getFarcasterUser(auctionDetail.highestBidder);
                
                if (farcasterUser && farcasterUser.fid) {
                  winnerFid = farcasterUser.fid;
                  console.log(`[Settle] Found winner's FID: ${winnerFid}, will prioritize winner notification`);
                  
                  // Step 1: Send the winner-specific notification first
                  console.log(`[Settle] Sending auction-won notification to winner (FID: ${winnerFid})`);
                  
                  try {
                    const wonResponse = await fetch('/api/notifications/auction-won', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        fid: winnerFid,
                        auctionId: id,
                      }),
                    });
                    
                    if (wonResponse.ok) {
                      console.log(`[Settle] ✅ Successfully sent auction-won notification to winner (FID: ${winnerFid})`);
                    } else {
                      const responseText = await wonResponse.text().catch(() => 'Could not read error response');
                      console.error(`[Settle] ❌ Failed to send auction-won notification: ${wonResponse.status}`, responseText);
                    }
                  } catch (wonError) {
                    console.error(`[Settle] ❌ Error sending auction-won notification:`, wonError);
                  }
                } else {
                  console.log(`[Settle] ℹ️ No Farcaster account found for winner address ${auctionDetail.highestBidder}, proceeding with broadcast only`);
                }
              } catch (fidLookupError) {
                console.error(`[Settle] ❌ Error looking up winner's FID:`, fidLookupError);
              }
              
              // Step 2: Send the broadcast notification to all users EXCEPT the winner (if we have their FID)
              console.log(`[Settle] Sending auction-settled notification to all users${winnerFid ? ` (excluding winner FID: ${winnerFid})` : ''}`);
              const settledResponse = await fetch('/api/notifications/auction-settled', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  auctionId: id,
                  winnerAddress: auctionDetail.highestBidder,
                  winnerName: winnerName,
                  excludeFid: winnerFid, // Pass the winner's FID to exclude them from broadcast
                }),
              });
              
              if (settledResponse.ok) {
                console.log(`[Settle] ✅ Successfully sent auction-settled notification to all users`);
              } else {
                const settledErrorData = await settledResponse.text().catch(() => 'Unknown error');
                console.error(`[Settle] ❌ Failed to send auction-settled notification: ${settledResponse.status}`, settledErrorData);
              }
            }
          } catch (notifError) {
            console.error(`[Settle] ❌ Error sending notifications:`, notifError);
          }
          
          return "New Auction Created";
        },
        error: (data: any) => {
          console.error(`[DEBUG] Transaction failed:`, data);
          return "Failed to settle and create new auction";
        },
      });
    } catch (error) {
      console.error(`[DEBUG] Settlement error:`, error);
    }
  }, [isComplete, id, auctionDetail, isConnected, address, isWhitelisted, whitelistLoading, settleTxn, bidderNameInfo, isV3Auction]);

  const updateDetails = async () => {
    await refetch();
    await refetchSettings();
  };

  const openBid = () => {
    setShowBidHistory(true);
  };

  // Update the refetching mechanism when ID changes to ensure proper refresh after settlement
  useEffect(() => {
    if (id) {
      // Clear any previous errors
      setFetchError(null);
      
      // Add a small delay to prevent race conditions
      const fetchTimer = setTimeout(async () => {
        setIsLoading(true);
        console.log(`Fetching details for auction #${id}`);
        
        try {
          const refetchResult = await refetch();
          console.log(`Refetch result for auction #${id}:`, refetchResult);
          
          await refetchSettings();
          
          // If we have contract read errors, log them in detail
          if (contractReadError) {
            console.error(`Contract read error for auction #${id}:`, contractReadError);
            setFetchError(`Error loading auction data: ${contractReadError.message}`);
          } else if (settingsError) {
            console.error(`Settings error for auction #${id}:`, settingsError);
            setFetchError(`Error loading auction settings: ${settingsError.message}`);
          }
        } catch (error: any) {
          console.error(`Error fetching auction #${id} details:`, error);
          setFetchError(`Failed to load auction data: ${error.message || 'Unknown error'}`);
        } finally {
          // If we've been loading for more than 5 seconds, set loading to false
          // even if we don't have data, to avoid UI being stuck in loading state
          setTimeout(() => {
            if (isLoading) {
              console.log(`Forcing loading state off for auction #${id} after timeout`);
              setIsLoading(false);
            }
          }, 5000);
          
          if (auctionDetail !== undefined) {
            console.log(`Setting loading to false for auction #${id}, we have data:`, auctionDetail);
            setIsLoading(false);
          }
        }
      }, 100); // Small delay to prevent race conditions
      
      return () => clearTimeout(fetchTimer);
    }
  }, [id]); // Only depend on id to prevent circular dependencies

  // Update document title with current bid
  useEffect(() => {
    // Start with default title
    document.title = "QR";
    
    // Only proceed if we have auction data and it's not loading
    if (!auctionDetail || isLoading) {
      return;
    }
    
    // Only show special title for active auctions with bids
    const now = Math.floor(Date.now() / 1000);
    const isAuctionActive = 
      !auctionDetail.settled && 
      auctionDetail.startTime > 0 && 
      auctionDetail.endTime > now && 
      auctionDetail.highestBid > 0n;
    
    if (isAuctionActive) {
      if (isV3Auction) {
        // For V3 auctions, use USDC format (6 decimals)
        const currentBid = Number(formatUnits(auctionDetail.highestBid, 6));
        // For whole numbers, don't show decimal places
        const bidText = Number.isInteger(currentBid) ? `${currentBid} USDC` : `${currentBid.toFixed(2)} USDC`;
        document.title = `QR ${bidText} - ${bidderNameInfo.displayName}`;
      } else {
        // For legacy and V2 auctions, use QR format (18 decimals)
        const currentBid = Number(formatEther(auctionDetail.highestBid));
        const usdValue = qrPrice ? currentBid * qrPrice : 0;
        const formattedQR = formatQRAmount(currentBid);
        const bidText = `${formattedQR} $QR ${usdValue > 0 ? `(${formatUsdValue(usdValue)})` : ''}`;
        document.title = `QR ${bidText} - ${bidderNameInfo.displayName}`;
      }
    }
  }, [auctionDetail, qrPrice, bidderNameInfo.displayName, isLoading, isV3Auction]);

  useEffect(() => {
    const ftSetled = async () => {
      const data = await auctionsSettled();
      if (data !== undefined) {
        setSettledAcustions(data);
      }
    };

    ftSetled();
  }, [isComplete]);

  useEffect(() => {
    const fetchBidderName = async () => {
      if (!auctionDetail?.highestBidder) return;
      
      // Make sure we're using a valid Ethereum address (0x...)
      const bidderAddress = auctionDetail.highestBidder;
      
      // Fetch Farcaster username from the API
      const farcasterUser = await getFarcasterUser(bidderAddress);
      
      // Format the address display
      const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      };
      
      // We can use the highestBidderName that's already fetched in useFetchAuctionDetails
      // since getName already handles the priority between basename and ENS name
      const name = auctionDetail.highestBidderName;
      
      // Prioritize names: Farcaster > getName result > formatted address
      let displayName;
      if (farcasterUser?.username) {
        // Quick temp fix - replace !217978 with softwarecurator
        const username = farcasterUser.username === "!217978" ? "softwarecurator" : farcasterUser.username;
        displayName = `@${username}`;
      } else if (name) {
        // Quick temp fix - replace !217978 with softwarecurator
        displayName = name === "!217978" ? "softwarecurator" : name;
      } else if (bidderAddress.startsWith('0x')) {
        displayName = formatAddress(bidderAddress);
      } else {
        displayName = bidderAddress; // Fallback to whatever we have
      }
      
      // Update bidder name info with properly typed state update
      setBidderNameInfo({
        displayName,
        farcasterUsername: farcasterUser?.username === "!217978" ? "softwarecurator" : (farcasterUser?.username || null),
        basename: name === "!217978" ? "softwarecurator" : (name || null),
        pfpUrl: farcasterUser?.pfpUrl || null
      });
    };

    if (auctionDetail?.highestBidder) {
      fetchBidderName();
    }
  }, [auctionDetail]);

  // Use the auction events hook to listen for real-time updates
  useAuctionEvents({
    onAuctionBid: (tokenId, bidder, amount, extended, endTime) => {
      // Only update if this event is for the current auction
      if (tokenId === BigInt(id)) {
        console.log(`Real-time update: New bid on auction #${id}`);
        // Update auction details when a new bid is placed
        refetch();
      }
    },
    onAuctionSettled: (tokenId, winner, amount) => {
      // Only update if this event is for the current auction
      if (tokenId === BigInt(id)) {
        console.log(`Real-time update: Auction #${id} settled`);
        // Update auction details when the auction is settled
        refetch();
      }
    },
    onAuctionCreated: (tokenId, startTime, endTime) => {
      console.log(`Real-time update: New auction #${tokenId} created`);
      
      // If we're on the latest auction, refresh data for the newly created auction
      if (isLatest) {
        console.log(`Refreshing data for new auction #${tokenId}`);
        refetch();
        refetchSettings();
      }
    },
    showToasts: false // Disable toasts in this component as they're already shown in the main page
  });

  // Format the end time in local timezone with abbreviated timezone name
  const formatEndTime = () => {
    if (!auctionDetail?.endTime) return "";
    
    const endDate = new Date(Number(auctionDetail.endTime) * 1000);
    
    // Format time as "11:45 AM"
    const timeStr = endDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    
    // Get timezone abbreviation using a more direct approach
    // This gives us reliable abbreviations like ET, CT, PT, IST, etc.
    const tzAbbr = (() => {
      // Extract timezone abbreviation from date string
      const tzMatch = endDate.toString().match(/\(([^)]+)\)/);
      if (!tzMatch) return '';
      
      // If it has spaces (like "Eastern Daylight Time"), take first letter of each word
      const tz = tzMatch[1];
      if (tz.includes(' ')) {
        return tz.split(' ').map(word => word[0]).join('');
      }
      
      // Already an abbreviation like "GMT"
      return tz;
    })();
    
    return `ends @ ${timeStr} ${tzAbbr}`;
  };

  // Update the useEffect or component render to show whitelist status in console
  useEffect(() => {
    if (address) {
      console.log(`Current wallet address: ${address}, Whitelist status: ${isWhitelisted}, Loading: ${whitelistLoading}`);
    }
  }, [address, isWhitelisted, whitelistLoading]);

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <div className="flex flex-row justify-between items-center w-full">
          <div className="inline-flex justify-start items-center gap-2">
            <h1 className="text-3xl font-bold">Auction #{id}</h1>
            <Button
              variant="outline"
              size="icon"
              className={`rounded-full border-none transition-colors ${
                isLatest
                  ? "bg-blue-100 hover:bg-blue-200 dark:bg-[#131313] dark:hover:bg-[#1F1F1F]" 
                  : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/30"
              } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground" : ""}`}
              onClick={onPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" 
              size="icon"
              className={`rounded-full border-none transition-colors ${
                (isLatest && !isAuction22 && !isAuction36)
                  ? `bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/30 opacity-50 cursor-not-allowed ${isBaseColors ? "bg-primary/90 hover:bg-primary/90 hover:text-foreground" : ""}`
                  : `bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/30 dark:hover:bg-gray-700/30 ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground" : ""}`
              }`}
              onClick={onNext}
              disabled={isLatest && !isAuction22 && !isAuction36}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Info
            size={30}
            onClick={() => setShowHowItWorks(true)}
            className={`${isBaseColors ? "text-foreground" : ""} cursor-pointer`}
          />
        </div>
        {isLoading && (
          <div className="flex flex-col space-y-3">
            <Skeleton className="h-[125px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        )}

        {fetchError && !isLoading && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-md text-red-700">
            <p className="font-medium">Error loading auction</p>
            <p className="text-sm">{fetchError}</p>
            <Button 
              onClick={() => refetch()} 
              className="mt-2 bg-red-100 text-red-700 hover:bg-red-200"
              size="sm"
            >
              Retry
            </Button>
          </div>
        )}

        {auctionDetail &&
          Number(auctionDetail.tokenId) === id &&
          !isLoading && (
            <>
              {/* Only show settled view if auction is actually settled or it's auction #22 */}
              {!auctionDetail.settled && !isAuction22 ? (
                <>
                  <div className="flex flex-row justify-between gap-8">
                    <div className="space-y-1.25 relative">
                      <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Current bid</div>
                      <div className="flex flex-row items-center gap-1">
                        <div className="text-xl md:text-2xl font-bold">
                          {isV3Auction ? (
                            // For V3 auctions, USDC has 6 decimals, not 18
                            `${formatUnits(auctionDetail?.highestBid || 0n, 6)} USDC`
                          ) : isLegacyAuction ? (
                            // For legacy auctions (V1), show ETH
                            `${formatQRAmount(Number(formatEther(auctionDetail?.highestBid || 0n)))} ETH`
                          ) : (
                            // For V2 auctions, show QR
                            `${formatQRAmount(Number(formatEther(auctionDetail?.highestBid || 0n)))} $QR`
                          )}
                        </div>
                        <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>
                          {usdBalance !== 0 && !isV3Auction && `(${formatUsdValue(usdBalance)})`}
                        </div>
                      </div>
                      <div className="h-4 mt-1 overflow-hidden" style={{ minHeight: "18px" }}>
                        <TypingIndicator />
                      </div>
                    </div>
                    {!isComplete && (
                      <div className="space-y-1">
                        <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"} text-right`}>
                          Time left
                        </div>
                        <div className={`${isBaseColors ? "text-foreground" : ""} text-right text-xl md:text-2xl font-bold whitespace-nowrap`}>
                          {time}
                        </div>
                        <div className={`${isBaseColors ? "text-foreground/80" : "text-gray-500 dark:text-gray-400"} text-right text-xs`}>
                          {formatEndTime()}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {!isComplete && (
                      <>
                        {isV3Auction ? (
                          <BidForm
                            auctionDetail={auctionDetail}
                            settingDetail={settingDetail}
                            onSuccess={updateDetails}
                            openDialog={openDialog}
                          />
                        ) : (
                          <div className="border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/30 rounded-md p-3 text-amber-800 dark:text-amber-200">
                            <p className="text-sm">
                              This auction is from a previous version (V{isLegacyAuction ? '1' : '2'}) and is read-only.
                              Only the current V3 auctions (ID 36+) accept bids.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {isComplete && (
                      <>
                        {isV3Auction ? (
                          <Button
                            className={`${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground" : ""} px-8 h-12`}
                            onClick={handleSettle}
                          >
                            Settle and create auction
                          </Button>
                        ) : (
                          <></>
                        )}
                      </>
                    )}

                    {auctionDetail && auctionDetail.highestBidder && (
                      <div className="flex flex-row text-sm items-start justify-between">
                        <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"} text-left flex items-center`}>
                          Highest bidder: 
                          <span className="ml-1 flex items-center">
                            {bidderNameInfo.displayName}
                            {bidderNameInfo.farcasterUsername && (
                              <WarpcastLogo 
                                size="sm" 
                                username={bidderNameInfo.farcasterUsername} 
                                className="ml-1 opacity-80 hover:opacity-100"
                              />
                            )}
                          </span>
                        </div>
                        <button
                          onClick={() => setShowBidHistory(true)}
                          className={`${isBaseColors ? "text-foreground underline" : "text-gray-600 dark:text-[#696969] underline"} text-right w-[120px]`}
                        >
                          All bids
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Don't show the "Visit Winning Site" button for auction #22 */}
                  {isAuction22 || isAuction36 ? (
                    <WinDetailsView
                      tokenId={BigInt(id)}
                      winner={auctionDetail.highestBidder}
                      amount={auctionDetail.highestBid}
                      url={auctionDetail.qrMetadata?.urlString || ""}
                      openDialog={openDialog}
                      openBids={openBid}
                    />
                  ) : (
                    <>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-gray-600 dark:text-[#696969]">Winning bid</div>
                          <div className="text-2xl font-bold">
                            {isV3Auction ? (
                              `${formatUnits(auctionDetail?.highestBid || 0n, 6)} USDC`
                            ) : isLegacyAuction ? (
                              `${formatQRAmount(Number(formatEther(auctionDetail?.highestBid || 0n)))} ETH`
                            ) : (
                              `${formatQRAmount(Number(formatEther(auctionDetail?.highestBid || 0n)))} $QR`
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600 dark:text-[#696969]">Won by</div>
                          <div className="flex items-center gap-2">
                            {bidderNameInfo.pfpUrl ? (
                              <img 
                                src={bidderNameInfo.pfpUrl} 
                                alt="Profile" 
                                className="w-6 h-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-6 h-6 bg-gray-200 rounded-full" />
                            )}
                            <span className="flex items-center">
                              {bidderNameInfo.displayName}
                              {bidderNameInfo.farcasterUsername && (
                                <WarpcastLogo 
                                  size="md" 
                                  username={bidderNameInfo.farcasterUsername} 
                                  className="ml-0.5 opacity-80 hover:opacity-100"
                                />
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Button
                        className="w-full bg-gray-900 hover:bg-gray-800"
                        onClick={() =>
                          window.open(auctionDetail?.qrMetadata.urlString, "_blank")
                        }
                      >
                        Visit Winning Site
                      </Button>

                      <div className="flex flex-row items-center text-sm justify-between">
                        <button
                          onClick={() => setShowBidHistory(true)}
                          className="text-gray-600 dark:text-[#696969] underline text-left w-full"
                        >
                          Prev bids
                        </button>
                        <button
                          onClick={() => setShowHowItWorks(true)}
                          className="text-gray-600 dark:text-[#696969] underline text-right w-[120px]"
                        >
                          How it works
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

        {auctionDetail &&
          Number(auctionDetail.tokenId) !== id &&
          !isLoading && (
            <>
              <WinDetailsView
                tokenId={currentSettledAuction?.tokenId || 0n}
                winner={currentSettledAuction?.winner || "0x"}
                amount={currentSettledAuction?.amount || 0n}
                url={currentSettledAuction?.url || ""}
                openDialog={openDialog}
                openBids={openBid}
              />
            </>
          )}
      </div>

      <BidHistoryDialog
        isOpen={showBidHistory}
        onClose={() => setShowBidHistory(false)}
        auctionId={id}
        latestId={Number(auctionDetail?.tokenId || id)}
        isComplete={isComplete}
        openDialog={openDialog}
      />

      <HowItWorksDialog
        isOpen={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
      />

      <SafetyDialog
        isOpen={isOpen}
        onClose={closeDialog}
        targetUrl={pendingUrl || ""}
        onContinue={handleContinue}
      />
    </div>
  );
}
