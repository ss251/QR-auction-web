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
import { ExternalLink, Loader2, X } from "lucide-react";
import { formatURL } from "@/utils/helperFunctions";
import { registerTransaction } from "@/hooks/useAuctionEvents";
import { useBaseColors } from "@/hooks/useBaseColors";
import { useTypingStatus } from "@/hooks/useTypingStatus";
import { MIN_QR_BID, MIN_USDC_BID } from "@/config/tokens";
import { formatQRAmount, formatUsdValue } from "@/utils/formatters";
import { UniswapModal } from "./ui/uniswap-modal";
import { useState, useEffect, useMemo, useRef } from "react";
import { useFetchBids } from "@/hooks/useFetchBids";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Address, Chain } from "viem";
import { useFundWallet } from "@privy-io/react-auth";
import { base } from "viem/chains";

// Polling configuration
const BALANCE_POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLLING_DURATION = 120000; // 2 minutes
const CONFIRMATION_DELAY = 10000; // 10 seconds before executing bid after funds arrive

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
  const [txPhase, setTxPhase] = useState<'idle' | 'approving' | 'confirming' | 'executing'>('idle');
  
  // Single state to track funding status - this represents both which button initiated funding
  // and whether we're waiting for funds
  const [fundingState, setFundingState] = useState<'idle' | 'waiting_from_bid' | 'waiting_from_buy'>('idle');
  
  // Store pending bid data for auto-execution after funding
  const pendingBidRef = useRef<{
    amount: number;
    url: string;
    requiredBalance: number;
  } | null>(null);
  
  // References for polling
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number | null>(null);
  
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
  
  // Check if user has a smart wallet
  const hasSmartWallet = !!smartWalletAddress;

  // Use Privy's useFundWallet hook
  const { fundWallet } = useFundWallet({
    onUserExited: ({ address, balance, chain, fundingMethod }: { address: Address, balance: bigint, chain: Chain, fundingMethod: string }) => {
      console.log(`[Funding] User exited funding flow. Address: ${address}, Balance: ${balance.toString()}, Chain: ${chain.name}, Method: ${fundingMethod}`);
      // We don't change any visible state here - polling will continue in the background
    }
  });
  
  const { bidAmount } = useWriteActions({
    tokenId: auctionDetail?.tokenId ? auctionDetail.tokenId : 0n,
  });

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
  
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useBalance({
    address: activeAddress,
    token: usdcTokenAddress as `0x${string}`
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
    ? (isV3Auction ? 1 : MIN_QR_BID) // For V3, we use 1 USDC flat minimum
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
    watch,
    getValues,
    formState: { errors, isValid },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    mode: "onChange", // Validate as the user types
  });
  
  // Watch the bid amount for use in the funding flow
  const bidAmount_formValue = watch("bid");
  const urlValue = watch("url");

  // Function to cancel funding process and clear up state
  const cancelFunding = () => {
    clearPolling();
    setFundingState('idle');
    pendingBidRef.current = null;
    toast.info("Funding process canceled");
  };

  // Clear all polling
  const clearPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingStartTimeRef.current = null;
  };

  // Start balance polling after funding initiation
  const startBalancePolling = (requiredBalance: number) => {
    // Clean up any existing polling
    clearPolling();
    
    // Mark polling start time
    pollingStartTimeRef.current = Date.now();
    
    // Save exact amount needed
    const pendingBid = pendingBidRef.current;
    if (pendingBid) {
      pendingBid.requiredBalance = requiredBalance;
    }
    
    console.log(`[Polling] Started polling for balance >= ${requiredBalance} USDC`);
    
    let lastSeenBalance = 0;
    
    // Start polling interval
    pollingIntervalRef.current = setInterval(async () => {
      // Check if we've exceeded max polling time
      if (pollingStartTimeRef.current && Date.now() - pollingStartTimeRef.current > MAX_POLLING_DURATION) {
        console.log(`[Polling] Exceeded maximum polling time of ${MAX_POLLING_DURATION}ms`);
        clearPolling();
        setFundingState('idle');
        pendingBidRef.current = null;
        toast.error("Funding timeout. You can try placing your bid again.");
        return;
      }
      
      try {
        // Fetch latest balance
        const freshBalance = await refetchUsdcBalance();
        const balance = freshBalance.data?.value || 0n;
        const formattedBalance = Number(formatUnits(balance, 6));
        
        // Log only when balance changes
        if (formattedBalance !== lastSeenBalance) {
          console.log(`[Polling] Current balance: ${formattedBalance} USDC, Required: ${requiredBalance} USDC`);
          lastSeenBalance = formattedBalance;
        }
        
        // Check if balance is sufficient
        if (formattedBalance >= requiredBalance) {
          console.log(`[Polling] Sufficient balance detected! Waiting ${CONFIRMATION_DELAY/1000}s for confirmation before executing bid...`);
          
          // Clear polling
          clearPolling();
          
          // Toast
          toast.success(`Funding successful! Your bid will be placed automatically in a few seconds...`);
          
          // Set timeout for bid execution to allow transaction to fully confirm
          setTimeout(() => {
            executePendingBid();
          }, CONFIRMATION_DELAY);
        }
      } catch (error) {
        console.error("[Polling] Error checking balance:", error);
      }
    }, BALANCE_POLL_INTERVAL);
  };

  // Execute the pending bid after funding is confirmed
  const executePendingBid = async () => {
    const pendingBid = pendingBidRef.current;
    if (!pendingBid) {
      console.log("[AutoBid] No pending bid found");
      setFundingState('idle');
      return;
    }
    
    console.log(`[AutoBid] Executing pending bid: ${pendingBid.amount} USDC on URL ${pendingBid.url}`);
    
    // Update UI
    setFundingState('idle');
    setIsPlacingBid(true);
    setTxPhase('approving'); // Start with approval phase
    
    try {
      // Final balance check
      const freshBalance = await refetchUsdcBalance();
      const currentBalance = freshBalance.data?.value || 0n;
      const formattedBalance = Number(formatUnits(currentBalance, 6));
      
      if (formattedBalance < pendingBid.requiredBalance) {
        console.log(`[AutoBid] Final balance check failed: ${formattedBalance} USDC < ${pendingBid.requiredBalance} USDC`);
        toast.error("Unable to place bid automatically. Please try again.");
        setIsPlacingBid(false);
        setTxPhase('idle');
        pendingBidRef.current = null;
        return;
      }
      
      // Define the phase change handler
      const handlePhaseChange = (phase: 'approving' | 'confirming' | 'executing') => {
        console.log(`[AutoBid] Transaction phase changed to: ${phase}`);
        setTxPhase(phase);
      };
      
      // Bid value with 6 decimals for USDC
      const bidValue = parseUnits(`${pendingBid.amount}`, 6);
      
      // Execute bid with smart wallet
      let hash;
      if (smartWalletClient) {
        hash = await bidAmount({
          value: bidValue,
          urlString: pendingBid.url,
          smartWalletClient: smartWalletClient,
          onPhaseChange: handlePhaseChange
        });
      } else {
        hash = await bidAmount({
          value: bidValue,
          urlString: pendingBid.url,
          onPhaseChange: handlePhaseChange
        });
      }
      
      // Register transaction
      registerTransaction(hash);
      
      // Get previous bidder info for notifications
      const previousBidder = auctionDetail?.highestBidder;
      const previousBid = auctionDetail?.highestBid;
      const auctionTokenId = auctionDetail?.tokenId;
      
      // Wait for transaction receipt
      const transactionReceiptPr = waitForTransactionReceipt(wagmiConfig, {
        hash: hash,
      });
      
      toast.promise(transactionReceiptPr, {
        loading: "Executing Transaction...",
        success: async (data: any) => {
          // Send notification to previous highest bidder
          if (previousBidder && 
              previousBidder !== activeAddress &&
              previousBidder !== "0x0000000000000000000000000000000000000000" &&
              previousBid && previousBid > 0n) {
            
            // Skip notifications in development environment
            const isDev = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
            if (!isDev) {
              try {
                console.log(`Sending outbid notification to previous bidder: ${previousBidder}`);
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
              }
            } else {
              console.log('[DEV MODE] Skipping outbid notification in development environment');
            }
          }
          
          // Reset
          reset();
          onSuccess();
          setIsPlacingBid(false);
          setTxPhase('idle');
          pendingBidRef.current = null;
          return "Bid placed successfully!";
        },
        error: (data: any) => {
          setIsPlacingBid(false);
          setTxPhase('idle');
          pendingBidRef.current = null;
          return "Failed to create bid";
        },
      });
    } catch (error) {
      console.error("[AutoBid] Error executing bid:", error);
      toast.error("Failed to place bid automatically. Please try again.");
      setIsPlacingBid(false);
      setTxPhase('idle');
      pendingBidRef.current = null;
    }
  };

  // Handle the buy USDC action with specified amount
  const handleBuyUSDC = (amount?: number, source: 'waiting_from_bid' | 'waiting_from_buy' = 'waiting_from_bid') => {
    console.log("[Fund] Starting funding process");
    
    if (hasSmartWallet && activeAddress) {
      // For smart wallet users, use Privy's fundWallet with specific amount
      const fundingAmount = amount?.toString() || '5'; // Default to 5 USDC if no amount specified
      
      console.log(`[Funding] Opening funding modal for ${fundingAmount} USDC`);
      
      // Start balance polling for auto-execution
      startBalancePolling(amount || 5);
      
      // Set the funding state based on which button initiated it
      setFundingState(source);
      
      // Initiate funding with Privy
      fundWallet(activeAddress, {
        chain: base,
        amount: fundingAmount,
        asset: 'USDC',
        defaultFundingMethod: 'card', // Skip directly to card payment
        uiConfig: {
          receiveFundsTitle: `Add ${fundingAmount} USDC to your wallet`,
          receiveFundsSubtitle: 'Fund your wallet to place a bid on qrcoin.fun'
        }
      });
    } else {
      // For regular users, show the LiFi modal
      setShowUniswapModal(true);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, []);

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
  const handleTypingEvent = () => {
    console.log('Triggering typing event');
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

    // Calculate bid amount based on auction type
    const fullBidAmount = isV3Auction 
      ? data.bid  // For USDC, use the actual value without multiplying
      : data.bid * 1_000_000; // For QR, multiply by 1M
    
    // For smart wallet users, always fetch fresh balance first
    if (hasSmartWallet && isV3Auction) {
      // Refresh USDC balance
      const freshBalanceResult = await refetchUsdcBalance();
      const currentUsdcBalance = freshBalanceResult.data;
      
      // Format current balance for comparison
      const formattedBalance = currentUsdcBalance 
        ? Number(formatUnits(currentUsdcBalance.value, 6)) 
        : 0;
      
      console.log(`[Balance Check] Current USDC balance: ${formattedBalance}, Required: ${fullBidAmount}`);
      
      // If balance is insufficient, store bid details and open funding flow
      if (formattedBalance < fullBidAmount) {
        // Store pending bid for later execution
        pendingBidRef.current = {
          amount: fullBidAmount,
          url: data.url,
          requiredBalance: fullBidAmount,
        };
        
        // Open funding modal with exact bid amount and start polling
        toast.info(`Insufficient balance. Opening payment to add ${fullBidAmount} USDC. Your bid will be placed automatically when funded.`);
        handleBuyUSDC(fullBidAmount, 'waiting_from_bid');
        return;
      }
    } else {
      // For regular wallets, check balance normally
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
        return;
      }
    }
    
    // Set bidding state to true only when actually submitting a transaction
    setIsPlacingBid(true);
    setTxPhase('approving'); // Default to approval phase initially

    try {
      // For V3/USDC, use 6 decimal places instead of 18
      const bidValue = isV3Auction
        ? parseUnits(`${fullBidAmount}`, 6)  // USDC has 6 decimals
        : parseUnits(`${fullBidAmount}`, 18); // QR/ETH have 18 decimals
      
      // Define the phase change handler
      const handlePhaseChange = (phase: 'approving' | 'confirming' | 'executing') => {
        console.log(`Transaction phase changed to: ${phase}`);
        setTxPhase(phase);
      };
      
      // Use smart wallet client if available, otherwise fall back to regular client
      let hash;
      if (smartWalletClient) {
        console.log("Placing bid using smart wallet:", smartWalletClient.account?.address);
        
        try {
          // Pass the smart wallet client to bidAmount along with phase change handler
          hash = await bidAmount({
            value: bidValue,
            urlString: data.url,
            smartWalletClient: smartWalletClient,
            onPhaseChange: handlePhaseChange
          });
        } catch (error) {
          console.error("Error during smart wallet bid process:", error);
          setIsPlacingBid(false);
          setTxPhase('idle');
          throw error;
        }
      } else {
        console.log("Placing bid using EOA wallet");
        try {
          // Pass the phase change handler to bidAmount
          hash = await bidAmount({
            value: bidValue,
            urlString: data.url,
            onPhaseChange: handlePhaseChange
          });
        } catch (error) {
          console.error("Error during EOA wallet bid process:", error);
          setIsPlacingBid(false);
          setTxPhase('idle');
          throw error;
        }
      }
      
      // Register the transaction hash to prevent duplicate toasts
      registerTransaction(hash);

      // Store previous highest bidder address for notification after transaction confirms
      const previousBidder = auctionDetail?.highestBidder;
      const previousBid = auctionDetail?.highestBid;
      const auctionTokenId = auctionDetail?.tokenId;

      // We no longer need to set the confirming phase here as it comes from the hook
      // The hook will set executing phase after transaction submission
      
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
            const isDev = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
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
          setTxPhase('idle'); // Reset transaction phase
          return "Bid Successful!";
        },
        error: (data: any) => {
          setIsPlacingBid(false); // Reset bidding state on error
          setTxPhase('idle'); // Reset transaction phase
          return "Failed to create bid";
        },
      });
    } catch (error) {
      console.error(error);
      setIsPlacingBid(false); // Reset bidding state on error
      setTxPhase('idle'); // Reset transaction phase
    }
  };

  // Check if button should be disabled
  const isPlaceBidDisabled = !isValid || isPlacingBid || fundingState === 'waiting_from_bid';
  const isBuyUsdcDisabled = isPlacingBid || fundingState === 'waiting_from_buy';

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            min={safeMinimumBid}
            step={stepSize}
            placeholder={isV3Auction ? `${Number(formattedMinBid).toFixed(2)} or more` : `${formattedMinBid} or more`}
            className="pr-16 border p-2 w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            {...register("bid")}
            onKeyDown={handleTypingEvent}
            onInput={handleTypingEvent}
            disabled={isPlacingBid || fundingState !== 'idle'}
          />
          <div className={`${isBaseColors ? "text-foreground" : "text-gray-500"} absolute inset-y-0 right-7 flex items-center pointer-events-none h-[36px]`}>
            {isV3Auction ? 'USDC ($)' : 'M $QR'}
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
              onKeyDown={handleTypingEvent}
              onInput={handleTypingEvent}
              disabled={isPlacingBid || fundingState !== 'idle'}
            />
            <div className={`${isBaseColors ? "text-foreground" : "text-gray-500"} absolute inset-y-0 right-7 flex items-center pointer-events-none h-[36px]`}>
              URL
            </div>
            {errors.url && (
              <p className="text-red-500 text-sm mt-1">{errors.url.message}</p>
            )}
          </div>
        </div>

        {/* Place Bid Button with Cancel Option */}
        <div className="relative">
          <Button
            type="submit"
            className={`px-8 py-2 text-white w-full ${
              !isPlaceBidDisabled ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-500"
            } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
            disabled={isPlaceBidDisabled}
          >
            {isPlacingBid ? (
              <span className="flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {/* Smart wallet users only see "Placing bid..." */}
                {hasSmartWallet ? (
                  "Placing bid..."
                ) : (
                  /* EOA wallet users see the multi-phase messages */
                  <>
                    {txPhase === 'approving' && "Waiting for approval..."}
                    {txPhase === 'confirming' && "Waiting for confirmation..."}
                    {txPhase === 'executing' && "Finalizing bid..."}
                  </>
                )}
                {/* Still show funding message for both wallet types */}
                {txPhase === 'idle' && fundingState === 'waiting_from_bid' && "Waiting for funds..."}
              </span>
            ) : fundingState === 'waiting_from_bid' ? (
              <span className="flex items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for funds...
              </span>
            ) : (
              "Place Bid"
            )}
          </Button>
          
          {/* Cancel button for the Place Bid button - only during funding */}
          {fundingState === 'waiting_from_bid' && (
            <button
              type="button"
              onClick={cancelFunding}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
              aria-label="Cancel funding"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {/* Buy USDC Button with Cancel Option - Only show for non-smart wallet users */}
        {!hasSmartWallet && (
          <div className="relative md:hidden">
            {/* <Button
              onClick={(e) => {
                e.preventDefault();
                
                // Store potential bid data in case the user makes a successful payment
                pendingBidRef.current = {
                  amount: bidAmount_formValue,
                  url: urlValue,
                  requiredBalance: bidAmount_formValue,
                };
                
                handleBuyUSDC(bidAmount_formValue, 'waiting_from_buy');
              }}
              type="button"
              className={`w-full px-8 py-2 text-white ${
                !isBuyUsdcDisabled ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-500"
              } ${isBaseColors ? "bg-primary hover:bg-primary/90 hover:text-foreground text-foreground border-none" : ""}`}
              disabled={isBuyUsdcDisabled}
            >
              {fundingState === 'waiting_from_buy' ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for funds...
                </span>
              ) : (
                "Buy USDC"
              )}
            </Button> */}
            
            {/* Cancel button for the Buy USDC button */}
            {/* {fundingState === 'waiting_from_buy' && (
              <button
                type="button"
                onClick={cancelFunding}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
                aria-label="Cancel funding"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            )} */}
          </div>
        )}
        
        {/* <UniswapModal
          open={showUniswapModal}
          onOpenChange={setShowUniswapModal}
          inputCurrency="NATIVE"
          outputCurrency="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" // USDC
        /> */}

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