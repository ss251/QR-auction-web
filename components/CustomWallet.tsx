import {
  usePrivy,
  useLogin,
  useLogout,
  useFundWallet
} from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useState, useEffect, useMemo } from "react";
import { useAccount, useBalance, useReadContracts, useSwitchChain, useDisconnect } from "wagmi";
import { base } from "viem/chains";
import { formatEther, Address, erc20Abi, parseUnits, isAddress, encodeFunctionData } from "viem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { LogOut, Wallet, Network, Send, ExternalLink, RefreshCcw, Copy, ChevronDown, PlusCircle, Loader2, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getFarcasterUser } from "@/utils/farcaster";
import { getName } from "@coinbase/onchainkit/identity";
import { useBaseColors } from "@/hooks/useBaseColors";
import clsx from "clsx";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { broadcastConnection } from "@/lib/channelManager";
import sdk from "@farcaster/frame-sdk";
import { frameSdk } from "@/lib/frame-sdk";

// --- Constants ---
const BASE_MAINNET_ID = 8453;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address; // Base Mainnet USDC
const QR_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN as Address;

// Define Token type
type Token = "ETH" | "USDC" | "$QR";

// Define type for Privy linked accounts
interface PrivyLinkedAccount {
  type: string;
  address: string;
  chain?: string;
  // Other properties might exist but we don't need to specify them
}

// --- Helper Function ---
function formatAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// --- Component ---
export function CustomWallet() {
  const [isClient, setIsClient] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [pfpUrl, setPfpUrl] = useState<string | null>(null);
  const [isFetchingName, setIsFetchingName] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(true); // Add loading state for wallet
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<Token>("ETH");
  const [isSending, setIsSending] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // Track connection state
  const [isFrame, setIsFrame] = useState(false); // Track if we're in a Farcaster frame
  const [frameFid, setFrameFid] = useState<number | null>(null); // Store the user's FID from frame context
  const [copied, setCopied] = useState(false); // Track whether the address was just copied

  const { ready, authenticated, user } = usePrivy();
  const { address: eoaAddress, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { data: ethBalance, isLoading: ethLoading, refetch: refetchEthBalance } = useBalance({ address: eoaAddress });
  const { logout } = useLogout();
  const { login } = useLogin({
    onComplete: () => {
      console.log("Login complete");
      setIsConnecting(false); // Reset connecting state on completion
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      toast.error("Login failed. Please try again.");
      setIsConnecting(false); // Reset connecting state on error
    }
  });

  const { fundWallet } = useFundWallet();
  
  // Get smart wallet information - focus on the client since that's what has an address
  const { client: smartWalletClient } = useSmartWallets();
  const userEmail = user?.email?.address;

  const isBaseColors = useBaseColors();
  
  // Helper function to determine avatar fallback content
  const getAvatarFallback = () => {
    if (userEmail) {
      return userEmail.substring(0, 1).toUpperCase();
    } else if (displayName) {
      return displayName.substring(0, 2).toUpperCase();
    }
    return <Wallet className="h-4 w-4"/>;
  };

  // Check if we're in a Farcaster frame on component mount
  useEffect(() => {
    const checkFrameContext = async () => {
      try {
        const context = await frameSdk.getContext();
        if (context && context.user && context.user.fid) {
          console.log("Running in Farcaster frame context", context);
          setIsFrame(true);
          setFrameFid(context.user.fid);
          // Set profile data from frame context
          if (context.user.displayName) {
            setDisplayName(context.user.displayName);
          } else if (context.user.username) {
            setDisplayName(`@${context.user.username}`);
          }
          if (context.user.pfpUrl) {
            setPfpUrl(context.user.pfpUrl);
          }
        } else {
          setIsFrame(false);
        }
      } catch (error) {
        console.log("Not in a Farcaster frame context:", error);
        setIsFrame(false);
      }
    };

    checkFrameContext();
  }, []);

  // Extract smart wallet address directly from the client
  const smartWalletAddress = useMemo(() => {
    // The address is in the client's account property
    if (smartWalletClient?.account) {
      return smartWalletClient.account.address as Address;
    }
    return undefined;
  }, [smartWalletClient]);
  
  // Get smart wallet address directly from user object (more reliable according to Privy docs)
  // https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/usage
  const smartWalletAddressFromUser = useMemo(() => {
    if (authenticated && user?.linkedAccounts) {
      const smartWallet = user.linkedAccounts.find((account: PrivyLinkedAccount) => account.type === 'smart_wallet');
      return smartWallet?.address as Address | undefined;
    }
    return undefined;
  }, [authenticated, user?.linkedAccounts]);

  // Use the address from linkedAccounts if available, fall back to client
  const finalSmartWalletAddress = smartWalletAddressFromUser || smartWalletAddress;
  
  const displayAddress = finalSmartWalletAddress ?? eoaAddress;
  const headerAddress = eoaAddress;
  
  // Debug logging
  useEffect(() => {
    console.log("Smart wallet client:", smartWalletClient?.account?.address);
    console.log("Smart wallet address:", smartWalletAddress);
    console.log("Smart wallet address from user:", smartWalletAddressFromUser);
    console.log("Final smart wallet address:", finalSmartWalletAddress);
    console.log("EOA address:", eoaAddress);
    console.log("Display address:", displayAddress);
    
    if (smartWalletClient && !finalSmartWalletAddress) {
      console.warn("Smart wallet client exists but no address found - check initialization");
    }
    
    // Only mark loading as complete when both loading paths are checked
    const walletDataLoaded = authenticated && 
      ((user?.linkedAccounts !== undefined) || (smartWalletClient !== undefined));
    
    if (walletDataLoaded) {
      setIsWalletLoading(false);
    }
  }, [smartWalletClient, smartWalletAddress, smartWalletAddressFromUser, 
      finalSmartWalletAddress, eoaAddress, displayAddress, authenticated, user?.linkedAccounts]);

  const isOnBase = useMemo(() => {
    return chain?.id === BASE_MAINNET_ID;
  }, [chain]);

  const { data: tokenBalances, isLoading: tokensLoading, refetch: refetchTokenBalances } = useReadContracts({
    contracts: [
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [displayAddress!] },
      { address: QR_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [displayAddress!] },
      { address: USDC_ADDRESS, abi: erc20Abi, functionName: "decimals" },
      { address: QR_ADDRESS, abi: erc20Abi, functionName: "decimals" },
    ],
    query: {
      enabled: !!displayAddress && isOnBase,
    },
  });

  // Track authentication state changes to broadcast connections
  useEffect(() => {
    if (authenticated && eoaAddress) {
      // Generate a unique browser instance ID to help identify this connection
      const browserInstanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      // Broadcast the wallet connection event
      console.log('Broadcasting wallet connection for address:', eoaAddress);
      broadcastConnection(eoaAddress, browserInstanceId);
    }
  }, [authenticated, eoaAddress]);

  const [usdcBalance, qrBalance, usdcDecimals, qrDecimals] = useMemo(() => {
    if (!tokenBalances || tokenBalances.length < 4) return [0, 0, 6, 18];
    const usdcDecimals = tokenBalances[2]?.result ?? 6;
    const qrDecimals = tokenBalances[3]?.result ?? 18;

    const usdcRaw = tokenBalances[0]?.result ?? 0n;
    const qrRaw = tokenBalances[1]?.result ?? 0n;

    const formatBalance = (raw: bigint, decimals: number): number => {
        if (!raw || !decimals) return 0;
        const divisor = 10n ** BigInt(decimals);
        const integerPart = raw / divisor;
        const fractionalPart = raw % divisor;
        const fractionalString = fractionalPart.toString().padStart(decimals, '0');
        return parseFloat(`${integerPart}.${fractionalString}`);
    }

    return [
        formatBalance(usdcRaw as bigint, usdcDecimals as number),
        formatBalance(qrRaw as bigint, qrDecimals as number),
        usdcDecimals as number,
        qrDecimals as number
    ];
  }, [tokenBalances]);

  const ethBalanceFormatted = useMemo(() => {
      return parseFloat(formatEther(ethBalance?.value ?? 0n));
  }, [ethBalance])

  // Detect if we're on mobile
  const isMobile = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }
    return false;
  }, []);

  // Handle profile click for Farcaster frame context
  const handleProfileClick = async () => {
    if (isFrame && frameFid) {
      try {
        // Use the Farcaster SDK to view the user's profile
        await sdk.actions.viewProfile({ fid: frameFid });
      } catch (error) {
        console.error("Error opening profile in frame:", error);
      }
    } else {
      // Regular wallet dialog opening behavior for non-frame environments
      setIsOpen(true);
    }
  };

  // Clear profile data when not authenticated or when address changes
  useEffect(() => {
    // If not authenticated, reset the profile data
    if (!authenticated && !isFrame) {
      setDisplayName(null);
      setPfpUrl(null);
      return;
    }
    
    // Only proceed with fetching if wallet is loaded, we have an address, and are authenticated
    if (!isWalletLoading && (finalSmartWalletAddress || eoaAddress) && authenticated && !isFrame && !isFetchingName) {
      setIsFetchingName(true);
      const fetchIdentity = async () => {
        try {
          // Always prioritize looking up by smart wallet if available
          const addressToLookup = finalSmartWalletAddress || eoaAddress;
          
          if (addressToLookup) {
            const fcUser = await getFarcasterUser(addressToLookup);
          if (fcUser) {
            setDisplayName(fcUser.displayName || `@${fcUser.username}`);
            setPfpUrl(fcUser.pfpUrl);
            return;
          }
            const ensName = await getName({ address: addressToLookup as `0x${string}`, chain: base });
          if (ensName) {
            setDisplayName(ensName);
            return;
          }
            
            // If no social identities found, use smart wallet address if available, otherwise EOA
            setDisplayName(formatAddress(addressToLookup));
          }
        } catch (error) {
          console.error("Error fetching identity:", error);
          const addressToShow = finalSmartWalletAddress || eoaAddress;
          if (addressToShow) {
            setDisplayName(formatAddress(addressToShow));
          }
        } finally {
          setIsFetchingName(false);
        }
      };
      fetchIdentity();
    }
  }, [eoaAddress, finalSmartWalletAddress, authenticated, isFetchingName, isFrame, isWalletLoading]);

  // Initialize client state but prevent auto-opening on mobile
  useEffect(() => {
    setIsClient(true);
    
    // Ensure the dialog is closed on initial mount, especially on mobile
    if (isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  const handleDisconnect = async () => {
    try {
      console.log("Logging out from Privy and clearing session...");
      
      // Clear local state first
      setDisplayName(null);
      setPfpUrl(null);
      setIsOpen(false);
      setShowSendForm(false);
      
      // Disconnect from wagmi first
      wagmiDisconnect();
      
      // Then log out from Privy 
      await logout();
      
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Failed to disconnect wallet. Try again.");
    }
  };

  const handleSwitchNetwork = () => {
    switchChain({ chainId: BASE_MAINNET_ID });
  };

  const handleInitiateSend = () => {
    setShowSendForm(true);
  };

  const handleAddFunds = () => {
      const targetAddress = finalSmartWalletAddress ?? eoaAddress;
      if (!targetAddress) {
          toast.error("No wallet address found to fund.");
          return;
      }
      fundWallet(targetAddress);
  };

  const handleConfirmSend = async () => {
    // Verify we have necessary data
    if (!displayAddress || !isOnBase) {
        toast.error("Wallet not ready or not on Base network.");
        return;
    }
    
    // Ensure recipient is a valid address and convert to proper format
    if (!isAddress(sendRecipient)) {
        toast.error("Invalid recipient address.");
        return;
    }
    const recipientAddress = sendRecipient as `0x${string}`;
    
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
        toast.error("Invalid amount.");
        return;
    }
    
    // Check balances before proceeding
    if (selectedToken === "ETH" && ethBalanceFormatted < amount) {
        toast.error("Insufficient ETH balance.");
        return;
    } else if (selectedToken === "USDC" && usdcBalance < amount) {
        toast.error("Insufficient USDC balance.");
        return;
    } else if (selectedToken === "$QR" && qrBalance < amount) {
        toast.error("Insufficient $QR balance.");
        return;
    }

    setIsSending(true);
    const toastId = toast.loading(`Preparing ${selectedToken} transaction...`);

    try {
        // Update the toast to show sending status
        toast.loading(`Sending ${amount} ${selectedToken}...`, { id: toastId });
        
        // Properly format and send the transaction using smart wallet client
        if (!smartWalletClient) {
            throw new Error("Smart wallet client not available");
        }
        
        console.log("Using smart wallet client for transaction:", smartWalletClient.account?.address);
            
        // Setup UI options for better user experience
        const uiOptions = {
            title: `Send ${selectedToken}`,
            description: `Sending ${amount} ${selectedToken} to ${formatAddress(sendRecipient)}`,
            buttonText: "Confirm Send"
        };
        
        // Create the transaction parameters based on token type
        const txParams = selectedToken === "ETH" 
            ? {
                to: recipientAddress,
                value: parseUnits(sendAmount, 18),
                chain: base
              }
            : {
                to: selectedToken === "USDC" ? USDC_ADDRESS : QR_ADDRESS,
                data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [recipientAddress, parseUnits(sendAmount, selectedToken === "USDC" ? usdcDecimals : qrDecimals)]
                }),
                chain: base
              };
              
        // Fire and forget - immediately show success and let the transaction process
        // This works around the issue with Privy's promise resolution
        smartWalletClient.sendTransaction(txParams, { uiOptions })
            .then(txHash => {
                console.log("Transaction sent with hash:", txHash);
                
                // Update the toast when we have the hash
                toast.success(`Sent ${amount} ${selectedToken}!`, {
                    id: toastId,
                    description: (
                        <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">
                            View on Basescan
                        </a>
                    )
                });
            })
            .catch(error => {
                console.error("Transaction failed:", error);
                toast.error(`Transaction failed: ${error instanceof Error ? error.message : "Unknown error"}`, {
                    id: toastId
                });
            });
        
        // Immediately clear form and show success, allowing transaction to process in background
        toast.success(`Transaction submitted!`, { id: toastId });
        
        // Reset form and refresh balances
        setSendRecipient("");
        setSendAmount("");
        setShowSendForm(false);
        setTimeout(refreshBalances, 1000);

    } catch (error: unknown) {
        console.error("Send preparation failed:", error);
        let errorMessage = "Failed to prepare transaction.";
        if (error instanceof Error) {
            errorMessage = error.message || errorMessage;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        // Make sure to dismiss the loading toast by updating it to an error toast
        toast.error(errorMessage, { id: toastId });
    } finally {
        setIsSending(false);
    }
  };

  const refreshBalances = () => {
    toast.info("Refreshing balances...");
    refetchEthBalance();
    refetchTokenBalances();
  }

  // Function to handle wallet connect button click
  const handleConnectWallet = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // First close our dialog to avoid showing multiple modals
    setIsOpen(false);
    
    // Set connecting state and trigger Privy login
    setIsConnecting(true);
    
    // Small timeout to ensure our dialog is fully closed before Privy opens
    setTimeout(() => {
      login();
      
      // Set a timeout to clean up if login modal gets stuck
      setTimeout(() => {
        if (isConnecting) {
          setIsConnecting(false);
        }
      }, 5000); // 5 second safety timeout
    }, 100);
    
    return false;
  };

  // Cleanup any modal-related issues when component unmounts
  useEffect(() => {
    return () => {
      // Reset states on unmount
      setIsConnecting(false);
      setIsOpen(false);
    };
  }, []);

  // Close handler for the dialog
  const handleOpenChange = (open: boolean) => {
    // Only allow the dialog to open if we're not in the connecting state
    if (isConnecting && !open) {
      setIsConnecting(false); // Allow closing the modal when connecting
    } else if (isConnecting && open) {
      return; // Prevent opening the modal when connecting
    }
    setIsOpen(open);
  };

  // If we're in a Farcaster frame, don't render the full wallet component
  // Just render the profile avatar that opens the user's Warpcast profile
  if (isFrame) {
    return (
      <Button
        variant="outline"
        className={clsx(
          "flex items-center gap-2 h-10 md:px-3",
          "p-0 w-10 md:w-auto",
          isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
        )}
        onClick={handleProfileClick}
        aria-label="View profile"
      >
        <Avatar className="h-10 w-10 md:h-6 md:w-6 border-none rounded-full"> 
          <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? "Profile"} />
          <AvatarFallback className="text-xs bg-muted">
            {isWalletLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : getAvatarFallback()}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium hidden md:inline">
          {isWalletLoading ? 
            <Skeleton className="h-4 w-20 inline-block" /> : 
            (userEmail ? userEmail : displayName ? displayName : <Skeleton className="h-4 w-20 inline-block" />)
          }
        </span>
      </Button>
    );
  }

  if (!isClient || !ready) {
    return (
      <Button variant="outline" size="icon" className="h-10 w-10">
        <Wallet className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {authenticated ? (
          <Button
            variant="outline"
            className={clsx(
              "flex items-center gap-2 h-10",
              "p-0 w-10",
              isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground"
            )}
            aria-label="Open wallet dialog"
          >
            <Avatar className="h-7 w-7 md:h-7 md:w-7 border-none rounded-full"> 
              <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? headerAddress} />
              <AvatarFallback className="text-xs bg-muted">
                {isWalletLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : getAvatarFallback()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden">
              {isWalletLoading ? 
                <Skeleton className="h-4 w-20 inline-block" /> : 
                (userEmail ? userEmail : displayName ? displayName : <Skeleton className="h-4 w-20 inline-block" />)
              }
            </span>
          </Button>
        ) : (
          <Button
            variant="outline"
            className={clsx(
              "h-10 text-sm font-medium",
              "px-3 md:px-3",
              "w-auto",
              isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
            )}
            onClick={handleConnectWallet}
          >
            <Wallet className="h-5 w-5 md:hidden" />
            <span className="hidden md:inline">Connect Wallet</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[80vh] overflow-y-auto">
        {authenticated && (
            <> 
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? ""} />
                        <AvatarFallback className="text-sm bg-muted">
                            {isWalletLoading ? "..." : getAvatarFallback()}
                        </AvatarFallback>
                    </Avatar>
                    {isWalletLoading ? 
                      <Skeleton className="h-5 w-24" /> : 
                      (userEmail ? userEmail : displayName ? displayName : <Skeleton className="h-5 w-24" />)
                    }
                  </DialogTitle>
                  {displayAddress && (
                      <DialogDescription className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                          <Wallet className="h-3 w-3"/> {formatAddress(displayAddress)} {copied ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" onClick={() => {
                              if (smartWalletAddress) {
                                navigator.clipboard.writeText(smartWalletAddress);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1400);
                              } else {
                                navigator.clipboard.writeText(displayAddress);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1400);
                              }
                            }} />
                          )}
                      </DialogDescription>
                  )}
                </DialogHeader>
        
                <div className={clsx(
                    "flex items-center justify-between p-2 rounded-md text-sm",
                    isOnBase ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                  )}>
                  <div className="flex items-center gap-1.5">
                    {isOnBase ? (
                       <Image src="/base-logo.png" alt="Base" width={16} height={16} /> 
                    ) : (
                       <Network className="h-4 w-4"/> 
                    )}
                    {isOnBase ? "Base Mainnet" : `Connected to ${chain?.name ?? 'Unknown Network'}`}
                  </div>
                  {!isOnBase && (
                    <Button size="sm" variant="outline" onClick={handleSwitchNetwork}>Switch to Base</Button>
                  )}
                </div>
        
                <Separator />
        
                <div className="space-y-3 py-2">
                    <DialogTitle className="text-base flex justify-between items-center">
                        Balances
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={refreshBalances} title="Refresh balances">
                            <RefreshCcw className="h-3 w-3" />
                        </Button>
                    </DialogTitle>
                    {isOnBase ? (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Image src="https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040" alt="ETH" width={16} height={16} className="rounded-full"/> ETH
                                </span>
                                {ethLoading ? <Skeleton className="h-5 w-20" /> :
                                <span className="font-mono">{parseFloat(formatEther(ethBalance?.value ?? 0n)).toFixed(5)}</span>
                                }
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Image src="https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" alt="USDC" width={16} height={16} /> USDC
                                </span>
                                {tokensLoading ? <Skeleton className="h-5 w-20" /> :
                                <span className="font-mono">{usdcBalance.toFixed(2)}</span>
                                }
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                                    <Image src="/qrLogo.png" alt="$QR" width={16} height={16} /> $QR
                                </span>
                                {tokensLoading ? <Skeleton className="h-5 w-20" /> :
                                <span className="font-mono">{qrBalance.toFixed(2)}</span>
                                }
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-center text-muted-foreground py-4">Switch to Base network to see balances.</p>
                    )}
                </div>
        
                <Separator />
        
                {showSendForm ? (
                    <div className="space-y-2 pt-2">
                        <DialogTitle className="text-base">Send Funds</DialogTitle>
                        <div className="flex gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-[80px] flex items-center justify-between">
                                        <Image 
                                            src={selectedToken === 'ETH' ? 'https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040' : selectedToken === 'USDC' ? 'https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040' : '/qr-logo.svg'}
                                            alt={selectedToken}
                                            width={16} height={16}
                                            className={clsx(selectedToken === 'ETH' && 'rounded-full')}
                                        />
                                        <ChevronDown className="h-4 w-4 opacity-50"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => setSelectedToken('ETH')}>
                                        <Image src="https://www.cryptologos.cc/logos/ethereum-eth-logo.png?v=040" alt="ETH" width={16} height={16} className="mr-2 rounded-full"/> ETH
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedToken('USDC')}>
                                        <Image src="https://www.cryptologos.cc/logos/usd-coin-usdc-logo.png?v=040" alt="USDC" width={16} height={16} className="mr-2"/> USDC
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedToken('$QR')}>
                                        <Image src="/qrLogo.png" alt="$QR" width={16} height={16} className="mr-2"/> $QR
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Input 
                                type="number" 
                                placeholder="Amount" 
                                value={sendAmount}
                                onChange={(e) => setSendAmount(e.target.value)}
                                className="flex-1"
                            />
                        </div>
                        <Input 
                            type="text" 
                            placeholder="Recipient Address (0x...)" 
                            value={sendRecipient}
                            onChange={(e) => setSendRecipient(e.target.value)}
                        />
                        <div className="flex gap-2 pt-1">
                            <Button 
                                onClick={handleConfirmSend} 
                                disabled={!isOnBase || isSending || !sendRecipient || !sendAmount}
                                className="flex-1"
                            >
                                {isSending ? "Sending..." : `Send ${selectedToken}`}
                            </Button>
                            <Button variant="outline" onClick={() => setShowSendForm(false)} className="flex-1">
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button variant="outline" onClick={handleInitiateSend} disabled={!isOnBase}>
                        <Send className="mr-2 h-4 w-4" /> Send
                      </Button>
                      <Button variant="outline" onClick={handleAddFunds} disabled={!displayAddress}>
                         <PlusCircle className="mr-2 h-4 w-4" /> Add Funds
                      </Button>

                      <a
                        href={`https://basescan.org/address/${displayAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="col-span-2"
                      >
                          <Button variant="outline" className="w-full">
                            <ExternalLink className="mr-2 h-4 w-4" /> View on Basescan
                          </Button>
                      </a>
                    </div>
                )}
        
                <Separator className="mt-4 mb-2"/> 

                <DialogFooter>
                  <Button variant="destructive" onClick={handleDisconnect} className="w-full">
                    <LogOut className="mr-2 h-4 w-4" /> Disconnect
                  </Button>
                </DialogFooter>
            </> 
        )}
      </DialogContent>
    </Dialog>
  );
} 