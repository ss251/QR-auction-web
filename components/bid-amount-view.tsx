/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { z } from "zod";
import { formatEther, parseUnits, formatUnits } from "viem";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { waitForTransactionReceipt } from "@wagmi/core";
import { toast } from "sonner";
import { useWriteActions } from "@/hooks/useWriteActions";
import { wagmiConfig } from "@/config/wagmiConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount, useBalance } from "wagmi";
import { SafeExternalLink } from "./SafeExternalLink";
import { ExternalLink, Loader2 } from "lucide-react";
import { formatURL } from "@/utils/helperFunctions";
import { registerTransaction } from "@/hooks/useAuctionEvents";
import { useBaseColors } from "@/hooks/useBaseColors";
import { useTypingStatus } from "@/hooks/useTypingStatus";
import { MIN_QR_BID, MIN_USDC_BID } from "@/config/tokens";
import { formatQRAmount, formatUsdValue } from "@/utils/formatters";
import { UniswapModal } from "./ui/uniswap-modal";
import { useState, useEffect, useMemo } from "react";
import { useFetchBids } from "@/hooks/useFetchBids";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Address } from "viem";

export function BidForm({
  auctionDetail,
  settingDetail,
  onSuccess,
  openDialog,
}: {
  auctionDetail: any;
  settingDetail: any;
  onSuccess: () => void;
  openDialog: (url: string) => boolean;
}) {
  const [showUniswapModal, setShowUniswapModal] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const isBaseColors = useBaseColors();
  const { isConnected, address: eoaAddress } = useAccount();
  const { handleTypingStart } = useTypingStatus();
  const { fetchHistoricalAuctions } = useFetchBids();
  
  // Get smart wallet information
  const { client: smartWalletClient } = useSmartWallets();

  // Extract smart wallet address directly from the client
  const smartWalletAddress = useMemo(() => {
    if (smartWalletClient?.account) {
      return smartWalletClient.account.address as Address;
    }
    return undefined;
  }, [smartWalletClient]);
  
  // Use smart wallet address if available, fall back to EOA
  const activeAddress = smartWalletAddress ?? eoaAddress;
  
  // Check if it's a legacy auction (1-22), v2 auction (23-35), or v3 auction (36+)
  const isLegacyAuction = auctionDetail?.tokenId <= 22n;
  const isV2Auction = auctionDetail?.tokenId >= 23n && auctionDetail?.tokenId <= 35n;
  const isV3Auction = auctionDetail?.tokenId >= 36n;
  
  // Set token addresses based on auction type
  const qrTokenAddress = "0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF"; // QR token address
  const usdcTokenAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC token address on Base
  
  // Get user's token balance based on auction type - use activeAddress instead of eoaAddress
  const { data: qrBalance } = useBalance({
    address: activeAddress,
    token: qrTokenAddress as `0x${string}`,
  });
  
  const { data: usdcBalance } = useBalance({
    address: activeAddress,
    token: usdcTokenAddress as `0x${string}`,
  });
  
  const { bidAmount } = useWriteActions({
    tokenId: auctionDetail?.tokenId ? auctionDetail.tokenId : 0n,
  });

  // Calculate the minimum bid value from the contract data
  const lastHighestBid = auctionDetail?.highestBid
    ? auctionDetail.highestBid
    : 0n;
  const minBidIncrement = settingDetail?.minBidIncrement 
    ? BigInt(settingDetail.minBidIncrement) 
    : BigInt("10"); // 10% fallback if not available
  const hundred = BigInt("100");

  // Compute the increment and the minBid
  const increment = (lastHighestBid * minBidIncrement) / hundred;
  
  // Calculate full token value based on auction type
  const fullMinimumBid = lastHighestBid === 0n 
    ? (isV3Auction ? 5 : MIN_QR_BID) // For V3, we use 5 USDC flat minimum
    : isV3Auction 
      ? Number(formatUnits(lastHighestBid + increment, 6)) // USDC has 6 decimals
      : Number(formatEther(lastHighestBid + increment)); // ETH/QR have 18 decimals
    
  // Display value in millions for QR, or in actual value for USDC
  const rawDisplayMinimumBid = isV3Auction 
    ? fullMinimumBid  // For USDC, show the actual value (no division)
    : fullMinimumBid / 1_000_000; // For QR, divide by 1M
  
  // Determine the required decimal places dynamically
  const minDecimalPlaces = (() => {
    // For USDC, we use 2 decimal places
    if (isV3Auction) return 2;
    
    // For QR tokens, calculate based on the value
    // Get the fractional part
    const fractionalPart = rawDisplayMinimumBid % 1;
    if (fractionalPart === 0) return 1; // At least 1 decimal place for readability
    
    // Convert to string and count decimal places
    const fractionalStr = fractionalPart.toString().split('.')[1] || '';
    
    // Find last non-zero digit
    let lastNonZeroPos = 0;
    for (let i = 0; i < fractionalStr.length; i++) {
      if (fractionalStr[i] !== '0') {
        lastNonZeroPos = i + 1; // +1 because we need to include this digit
      }
    }
    
    // Cap at 6 decimal places for usability
    return Math.min(lastNonZeroPos, 6);
  })();
  
  // Create a properly rounded display value with the required precision
  const decimalFactor = Math.pow(10, minDecimalPlaces);
  const safeMinimumBid = Math.floor(rawDisplayMinimumBid * decimalFactor) / decimalFactor;
  
  // Format with the required decimal places but trim trailing zeros
  const formattedMinBid = safeMinimumBid.toFixed(minDecimalPlaces).replace(/\.?0+$/, '');
  
  // Step size for the input (0.001, 0.0001, etc. based on required precision)
  const stepSize = Math.pow(10, -minDecimalPlaces).toString();

  const targetUrl = auctionDetail?.qrMetadata?.urlString || "";
  const displayUrl = targetUrl ? (targetUrl === "0x" ? "" : targetUrl) : "";

  // Define the schema using the computed minimum
  const formSchema = z.object({
    bid: z.coerce
      .number({
        invalid_type_error: "Bid must be a number",
      })
      // Validate against safe minimum value that matches our display format
      .refine(val => val >= safeMinimumBid, 
        `Bid must be at least ${formattedMinBid}`),
    url: z.string().url("Invalid URL"),
  });

  type FormSchemaType = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    mode: "onChange", // Validate as the user types
  });

  // Auto-populate the URL field with the user's previous bid URL
  useEffect(() => {
    if (auctionDetail?.tokenId && activeAddress) {
      const fetchPreviousBid = async () => {
        try {
          const bids = await fetchHistoricalAuctions();
          if (bids) {
            // Filter bids by current auction and user address
            const userBidsForThisAuction = bids.filter(
              bid => 
                bid.tokenId === auctionDetail.tokenId && 
                bid.bidder.toLowerCase() === activeAddress.toLowerCase()
            );
            
            // Sort by timestamp/amount to get the most recent bid
            // Assuming higher amount means more recent bid
            userBidsForThisAuction.sort((a, b) => 
              Number(b.amount) - Number(a.amount)
            );
            
            // Get the user's most recent bid URL
            if (userBidsForThisAuction.length > 0 && userBidsForThisAuction[0].url) {
              // Pre-populate the URL field with the user's last bid URL
              setValue("url", userBidsForThisAuction[0].url);
            }
          }
        } catch (error) {
          console.error("Error fetching previous bids:", error);
        }
      };
      
      fetchPreviousBid();
    }
  }, [auctionDetail?.tokenId, activeAddress, fetchHistoricalAuctions, setValue]);

  // Clear URL field when wallet is disconnected
  useEffect(() => {
    if (!isConnected) {
      setValue("url", "");
    }
  }, [isConnected, setValue]);

  // Handle typing event separately from form validation
  const handleKeyDown = () => {
    // Always trigger typing events, even from anonymous users
    console.log('Triggering typing event from keyboard input');
    handleTypingStart();
  };

  // Also trigger typing on input change to catch paste events
  const handleInputChange = () => {
    // Always trigger typing events, even from anonymous users
    console.log('Triggering typing event from input change');
    handleTypingStart();
  };

  const onSubmit = async (data: FormSchemaType) => {
    console.log("Form data:", data);

    if (!isConnected) {
      toast.error("Connect a wallet");
      return;
    }

    // Check if smart wallet is available when needed
    if (!activeAddress) {
      toast.error("No wallet address available");
      return;
    }

    // Set bidding state to true at the start of the process
    setIsPlacingBid(true);

    try {
      // Calculate bid amount based on auction type
      const fullBidAmount = isV3Auction 
        ? data.bid  // For USDC, use the actual value without multiplying
        : data.bid * 1_000_000; // For QR, multiply by 1M
      
      // Check if user has enough tokens
      let hasEnoughTokens = false;
      let tokenSymbol = '';
      
      if (isV3Auction) {
        hasEnoughTokens = !!(usdcBalance && Number(usdcBalance.formatted) >= fullBidAmount);
        tokenSymbol = 'USDC';
      } else {
        hasEnoughTokens = !!(qrBalance && Number(qrBalance.formatted) >= fullBidAmount);
        tokenSymbol = '$QR';
      }

      if (!hasEnoughTokens) {
        // Show appropriate message based on token type
        toast.info(`You don't have enough ${tokenSymbol} tokens for this bid`);
        setShowUniswapModal(true);
        setIsPlacingBid(false); // Reset bidding state
        return;
      }
      
      // For V3/USDC, use 6 decimal places instead of 18
      const bidValue = isV3Auction
        ? parseUnits(`${fullBidAmount}`, 6)  // USDC has 6 decimals
        : parseUnits(`${fullBidAmount}`, 18); // QR/ETH have 18 decimals
      
      // Use smart wallet client if available, otherwise fall back to regular client
      let hash;
      if (smartWalletClient) {
        console.log("Placing bid using smart wallet:", smartWalletClient.account?.address);
        
        // Pass the smart wallet client to bidAmount
        hash = await bidAmount({
          value: bidValue,
          urlString: data.url,
          smartWalletClient: smartWalletClient
        });
      } else {
        console.log("Placing bid using EOA wallet");
        hash = await bidAmount({
          value: bidValue,
          urlString: data.url
        });
      }
      
      // Register the transaction hash to prevent duplicate toasts
      registerTransaction(hash);

      // Store previous highest bidder address for notification after transaction confirms
      const previousBidder = auctionDetail?.highestBidder;
      const previousBid = auctionDetail?.highestBid;
      const auctionTokenId = auctionDetail?.tokenId;

      const transactionReceiptPr = waitForTransactionReceipt(wagmiConfig, {
        hash: hash,
      });

      toast.promise(transactionReceiptPr, {
        loading: "Executing Transaction...",
        success: async (data: any) => {
          // Send notification to previous highest bidder AFTER transaction confirms
          if (previousBidder && 
              previousBidder !== activeAddress &&
              previousBidder !== "0x0000000000000000000000000000000000000000" &&
              previousBid && previousBid > 0n) {
            
            // Skip notifications in development environment
            const isDev = process.env.NODE_ENV === 'development';
            if (!isDev) {
              try {
                console.log(`Sending outbid notification to previous bidder: ${previousBidder}`);
                // Call the API to send outbid notification
                await fetch('/api/notifications/outbid', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    bidderAddress: previousBidder,
                    auctionId: Number(auctionTokenId),
                  }),
                });
              } catch (error) {
                console.error('Failed to send outbid notification:', error);
                // Don't block the main flow if notification fails
              }
            } else {
              console.log('[DEV MODE] Skipping outbid notification in development environment');
            }
          }
          
          reset();
          onSuccess();
          setIsPlacingBid(false); // Reset bidding state on success
          return "Bid Successful!";
        },
        error: (data: any) => {
          setIsPlacingBid(false); // Reset bidding state on error
          return "Failed to create bid";
        },
      });
    } catch (error) {
      console.error(error);
      setIsPlacingBid(false); // Reset bidding state on error
    }
  };

  // Determine the token symbol suffix based on auction type
  const tokenSuffix = isV3Auction ? 'USDC' : 'M $QR';

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            min={safeMinimumBid}
            step={stepSize}
            placeholder={`${formattedMinBid} or more`}
            className="pr-16 border p-2 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            {...register("bid")}
            onKeyDown={handleKeyDown}
            onInput={handleInputChange}
            disabled={isPlacingBid}
          />
          <div className={`${isBaseColors ? "text-foreground" : "text-gray-500"} absolute inset-y-0 right-7 flex items-center pointer-events-none h-[36px]`}>
            {isV3Auction ? 'USDC' : 'M $QR'}
          </div>
          {errors.bid && (
            <p className="text-red-500 text-sm mt-1">{errors.bid.message}</p>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="https://"
              className="pr-16 border p-2 w-full"
              spellCheck="false"
              {...register("url")}
              onKeyDown={handleKeyDown}
              onInput={handleInputChange}
              disabled={isPlacingBid}
            />
            <div className={`${isBaseColors ? "text-foreground" : "text-gray-500"} absolute inset-y-0 right-7 flex items-center pointer-events-none h-[36px]`}>
              URL
            </div>
            {errors.url && (
              <p className="text-red-500 text-sm mt-1">{errors.url.message}</p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className={`px-8 py-2 text-white ${
            isValid && !isPlacingBid ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-500"
          } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
          disabled={!isValid || isPlacingBid}
        >
          {isPlacingBid ? (
            <span className="flex items-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Placing bid...
            </span>
          ) : (
            "Place Bid"
          )}
        </Button>

        <Button
          onClick={(e) => {
            e.preventDefault(); // Prevent form submission
            setShowUniswapModal(true);
          }}
          type="button" // Explicitly set type to button to avoid form submission
          className={`md:hidden px-8 py-2 text-white ${
            "bg-gray-900 hover:bg-gray-800"
          } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
          disabled={isPlacingBid}
        >
          {isV3Auction ? 'Buy USDC' : 'Buy $QR'}
        </Button>
        <UniswapModal
          open={showUniswapModal}
          onOpenChange={setShowUniswapModal}
          inputCurrency="NATIVE"
          outputCurrency={isV3Auction ? 
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" : // USDC
            "0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF"   // QR
          }
        />

        {displayUrl !== "" && (
          <div className={`mt-0.5 p-3 bg-orange-50/30 border border-orange-100/50 rounded-md ${isBaseColors ? "bg-background" : "bg-gray-900 dark:bg-[#131313]"}`}>
            <div className="text-sm w-full overflow-hidden">
              <span className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-gray-300"}`}>Current bid website: </span>
              <SafeExternalLink
                href={targetUrl || ""}
                className={`font-medium hover:text-gray-900 transition-colors inline-flex items-center max-w-[calc(100%-135px)] ${isBaseColors ? "text-foreground" : "text-gray-700 dark:text-gray-400"}`}
                onBeforeNavigate={openDialog}
              >
                <span className="truncate inline-block align-middle">
                  {formatURL(displayUrl, false, false, 260)}
                </span>
                <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
              </SafeExternalLink>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}