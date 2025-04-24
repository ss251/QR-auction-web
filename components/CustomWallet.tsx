import {
  usePrivy,
  useLogin,
  useLogout,
  useFundWallet
} from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useState, useEffect, useMemo } from "react";
import { useAccount, useBalance, useReadContracts, useSwitchChain } from "wagmi";
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
import { Copy, LogOut, Wallet, Network, Send, Download, ExternalLink, RefreshCcw, Mail, ChevronDown, PlusCircle, Zap } from "lucide-react";
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

// --- Constants ---
const BASE_MAINNET_ID = 8453;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address; // Base Mainnet USDC
const QR_ADDRESS = process.env.NEXT_PUBLIC_QR_COIN as Address;

// Define Token type
type Token = "ETH" | "USDC" | "$QR";

// Define LinkedAccount type to avoid 'any'
interface LinkedAccount {
  type: string;
  walletClient?: string;
  chainId?: string;
  address?: string;
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
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<Token>("ETH");
  const [isSending, setIsSending] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // Track connection state

  const { ready, authenticated, user, exportWallet } = usePrivy();
  const { address: eoaAddress, chain } = useAccount();
  const { switchChain } = useSwitchChain();
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

  // Extract smart wallet address directly from the client
  const smartWalletAddress = useMemo(() => {
    // The address is in the client's account property
    if (smartWalletClient?.account) {
      return smartWalletClient.account.address as Address;
    }
    return undefined;
  }, [smartWalletClient]);
  
  const displayAddress = smartWalletAddress ?? eoaAddress;
  const headerAddress = eoaAddress;
  
  // Debug logging
  useEffect(() => {
    console.log("Smart wallet client:", smartWalletClient?.account?.address);
    console.log("Smart wallet address:", smartWalletAddress);
    console.log("EOA address:", eoaAddress);
    console.log("Display address:", displayAddress);
    
    if (smartWalletClient && !smartWalletAddress) {
      console.warn("Smart wallet client exists but no address found - check initialization");
    }
  }, [smartWalletClient, smartWalletAddress, eoaAddress, displayAddress]);

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

  useEffect(() => {
    if (eoaAddress && !displayName && !isFetchingName) {
      setIsFetchingName(true);
      const fetchIdentity = async () => {
        try {
          const fcUser = await getFarcasterUser(eoaAddress);
          if (fcUser) {
            setDisplayName(fcUser.displayName || `@${fcUser.username}`);
            setPfpUrl(fcUser.pfpUrl);
            return;
          }
          const ensName = await getName({ address: eoaAddress as `0x${string}`, chain: base });
          if (ensName) {
            setDisplayName(ensName);
            return;
          }
          setDisplayName(formatAddress(eoaAddress));
        } catch (error) {
          console.error("Error fetching identity:", error);
          setDisplayName(formatAddress(eoaAddress));
        } finally {
          setIsFetchingName(false);
        }
      };
      fetchIdentity();
    } else if (!eoaAddress) {
        setDisplayName(null);
        setPfpUrl(null);
    }
  }, [eoaAddress, displayName, isFetchingName]);

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
      
      // Actually log out from Privy - this is the critical part
      await logout();
      
    } catch (error) {
      console.error("Error during logout:", error);
      toast.error("Failed to disconnect wallet. Try again.");
    }
  };

  const handleSwitchNetwork = () => {
    switchChain({ chainId: BASE_MAINNET_ID });
  };

  const copyAddress = () => {
    if (!headerAddress) return;
    navigator.clipboard.writeText(headerAddress);
    toast.info("Signer address copied!");
  };

  const copySmartWalletAddress = () => {
    if (!smartWalletAddress) return;
    navigator.clipboard.writeText(smartWalletAddress);
    toast.info("Smart Wallet address copied!");
  }

  const handleExportKey = async () => {
      // Find the embedded wallet
      const embeddedWallet = user?.linkedAccounts?.find(
          (account: LinkedAccount) => account.type === 'wallet' && account.walletClient === 'privy'
      );
      if (!authenticated || !embeddedWallet) {
          toast.error("Export only available for Privy embedded wallets.");
          return;
      }
      try {
          await exportWallet();
      } catch (error) {
          console.error("Export wallet failed:", error);
          toast.error("Failed to initiate wallet export.");
      }
  };

  const handleInitiateSend = () => {
    setShowSendForm(true);
  };

  const handleAddFunds = () => {
      const targetAddress = smartWalletAddress ?? eoaAddress;
      if (!targetAddress) {
          toast.error("No wallet address found to fund.");
          return;
      }
      fundWallet(targetAddress);
  };

  const handleConfirmSend = async () => {
    // Verify smart wallet client is available
    if (!smartWalletClient) {
        console.error("Smart wallet client not available");
        toast.error("Smart wallet not initialized. Please try reconnecting your wallet.");
        return;
    }
    
    // Log which address we're sending from
    console.log("Sending transaction from:", smartWalletClient.account?.address);
    
    if (!displayAddress || !isOnBase) {
        toast.error("Smart wallet not ready or not on Base network.");
        return;
    }
    
    if (!isAddress(sendRecipient)) {
        toast.error("Invalid recipient address.");
        return;
    }
    
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
        toast.error("Invalid amount.");
        return;
    }

    setIsSending(true);
    const toastId = toast.loading(`Preparing ${selectedToken} transaction...`);

    try {
        let tx: { to: Address; value?: bigint; data?: `0x${string}` };
        let sufficientBalance = false;

        if (selectedToken === "ETH") {
            sufficientBalance = ethBalanceFormatted >= amount;
            if (!sufficientBalance) throw new Error("Insufficient ETH balance.");
            const value = parseUnits(sendAmount, 18);
            tx = { to: sendRecipient as Address, value };
        } else {
            const tokenAddress = selectedToken === "USDC" ? USDC_ADDRESS : QR_ADDRESS;
            const balance = selectedToken === "USDC" ? usdcBalance : qrBalance;
            const decimals = selectedToken === "USDC" ? usdcDecimals : qrDecimals;
            sufficientBalance = balance >= amount;
            if (!sufficientBalance) throw new Error(`Insufficient ${selectedToken} balance.`);
            const parsedAmount = parseUnits(sendAmount, decimals);
            
            // Encode ERC20 transfer data
            const transferData = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'transfer',
                args: [sendRecipient as Address, parsedAmount],
            });

            tx = { to: tokenAddress, data: transferData };
        }

        toast.loading(`Sending ${amount} ${selectedToken}...`, { id: toastId });

        // Ensure we're using the smart wallet client for transactions
        if (!smartWalletClient.account) {
            throw new Error("Smart wallet client account not initialized");
        }
        
        // Send transaction using the smart wallet client
        const txResponse = await smartWalletClient.sendTransaction(tx);
        const txHash = txResponse;

        toast.success(`Sent ${amount} ${selectedToken}!`, {
            id: toastId,
            description: (
                <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">
                    View on Basescan
                </a>
            )
        });

        // Reset form and refresh balances
        setSendRecipient("");
        setSendAmount("");
        setShowSendForm(false);
        setTimeout(refreshBalances, 2000); 

    } catch (error: unknown) {
        console.error("Send failed:", error);
        let errorMessage = "Failed to send transaction.";
        if (error instanceof Error) {
            // The shortMessage property is specific to ethers/viem errors
            const ethersError = error as { shortMessage?: string; message: string };
            errorMessage = ethersError.shortMessage || ethersError.message || errorMessage;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
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
              "flex items-center gap-2 h-10 md:px-3",
              "p-0 w-10 md:w-auto",
              isBaseColors && "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none"
            )}
            aria-label="Open wallet dialog"
          >
            <Avatar className="h-10 w-10 md:h-6 md:w-6 border-none rounded-full md:rounded-md"> 
              <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? headerAddress} />
              <AvatarFallback className="text-xs bg-muted">
                {displayName ? displayName.substring(0, 2).toUpperCase() : <Wallet className="h-4 w-4"/>}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden md:inline">
              {displayName ? displayName : <Skeleton className="h-4 w-20 inline-block" />}
              {smartWalletAddress && <Zap className="h-3 w-3 ml-1 inline-block text-yellow-500" />}
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
      <DialogContent className="sm:max-w-[425px]">
        {authenticated && (
            <> 
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={pfpUrl ?? undefined} alt={displayName ?? headerAddress} />
                        <AvatarFallback className="text-sm bg-muted">
                            {displayName ? displayName.substring(0, 2).toUpperCase() : "..."}
                        </AvatarFallback>
                    </Avatar>
                    {displayName || <Skeleton className="h-5 w-24" />}
                  </DialogTitle>
                  <DialogDescription
                    className="flex items-center gap-1 text-xs text-muted-foreground pt-1 cursor-pointer hover:text-foreground"
                    onClick={copyAddress}
                    title="Copy Signer (EOA) address"
                  >
                    Signer: {formatAddress(headerAddress)} <Copy className="h-3 w-3" />
                  </DialogDescription>
                  {smartWalletAddress && (
                     <DialogDescription
                        className="flex items-center gap-1 text-xs text-muted-foreground pt-1 cursor-pointer hover:text-foreground"
                        onClick={copySmartWalletAddress}
                        title="Copy Smart Wallet address"
                     >
                        <Zap className="h-3 w-3 mr-0.5 text-yellow-500"/> Smart Wallet: {formatAddress(smartWalletAddress)} <Copy className="h-3 w-3" />
                     </DialogDescription>
                  )}
                  {userEmail && (
                      <DialogDescription className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                          <Mail className="h-3 w-3"/> {userEmail}
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
                    <div className="space-y-3 pt-2">
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
                        <Button 
                            onClick={handleConfirmSend} 
                            disabled={!isOnBase || isSending || !sendRecipient || !sendAmount}
                            className="w-full"
                        >
                            {isSending ? "Sending..." : `Confirm Send ${selectedToken}`}
                        </Button>
                        <Button variant="ghost" onClick={() => setShowSendForm(false)} className="w-full text-xs text-muted-foreground">Cancel</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button variant="outline" onClick={handleInitiateSend} disabled={!isOnBase}>
                        <Send className="mr-2 h-4 w-4" /> Send
                      </Button>
                      <Button variant="outline" onClick={handleAddFunds} disabled={!displayAddress}>
                         <PlusCircle className="mr-2 h-4 w-4" /> Add Funds
                      </Button>
                      <Button
                            variant="outline"
                            onClick={handleExportKey} 
                            disabled={!authenticated || !user?.linkedAccounts?.find((account: LinkedAccount) => account.type === 'wallet' && account.walletClient === 'privy')}
                            title={!user?.linkedAccounts?.find((account: LinkedAccount) => account.type === 'wallet' && account.walletClient === 'privy') ? "Export only available for embedded wallets" : "Export your wallet's private key"}
                            className="col-span-2"
                        >
                        <Download className="mr-2 h-4 w-4" /> Export Signer Key
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