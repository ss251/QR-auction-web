"use client";
import { formatEther, formatUnits } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RandomColorAvatar } from "./RandomAvatar";
import { SafeExternalLink } from "./SafeExternalLink";
import { WarpcastLogo } from "./WarpcastLogo";
import { getFarcasterUser } from "@/utils/farcaster";
import { useBaseColors } from "@/hooks/useBaseColors";
import { formatQRAmount } from "@/utils/formatters";

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
};

type NameInfo = {
  displayName: string;
  farcasterUsername: string | null;
  basename: string | null;
  pfpUrl: string | null;
};

export function BidCellView({
  bid,
  openDialog,
}: {
  bid: AuctionType;
  openDialog: (url: string) => boolean;
}) {
  const isBaseColors = useBaseColors();
  const [nameInfo, setNameInfo] = useState<NameInfo>({
    displayName: `${bid.bidder.slice(0, 4)}...${bid.bidder.slice(-4)}`,
    farcasterUsername: null,
    basename: null,
    pfpUrl: null
  });

  // Check auction version based on tokenId
  const isLegacyAuction = bid.tokenId <= 22n;
  const isV2Auction = bid.tokenId >= 23n && bid.tokenId <= 35n;
  const isV3Auction = bid.tokenId >= 36n;
  
  // Calculate amount based on auction type
  const amount = isV3Auction 
    ? Number(formatUnits(bid.amount, 6)) // USDC has 6 decimals
    : Number(formatEther(bid.amount)); // ETH and QR have 18 decimals

  function formatAmount(amount: number, isLegacy: boolean, isV2: boolean, isV3: boolean) {
    if (isLegacy) {
      return `Ξ ${amount.toFixed(3)}`;
    } else if (isV2) {
      return `${formatQRAmount(amount)} $QR`;
    } else if (isV3) {
      // For whole numbers, don't show decimal places
      return Number.isInteger(amount) ? `${amount} USDC` : `${amount.toFixed(2)} USDC`;
    }
  }

  function formatURL(url: string) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace("www.", "");
      const path = urlObj.pathname;

      // If there's a path, show first 5 characters + ellipsis
      if (path && path.length > 1) {
        // Check if path exists and is not just "/"
        return `${domain}${path.slice(0, 6)}...`;
      }

      return domain;
    } catch {
      return url;
    }
  }

  useEffect(() => {
    const fetchNames = async () => {
      // Make sure we're using a valid Ethereum address
      const bidderAddress = bid.bidder;
      
      // Fetch name (basename or ENS) using onchainkit
      const name = await getName({
        address: bidderAddress as Address,
        chain: base,
      });
      
      // Fetch Farcaster username
      const farcasterUser = await getFarcasterUser(bidderAddress);
      
      // Format the address display
      const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      };
      
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
      
      // Update state with the results
      setNameInfo({
        displayName,
        farcasterUsername: farcasterUser?.username === "!217978" ? "softwarecurator" : (farcasterUser?.username || null),
        basename: name === "!217978" ? "softwarecurator" : name, // Store the getName result in basename
        pfpUrl: farcasterUser?.pfpUrl || null
      });
    };

    fetchNames();
  }, [bid.bidder]);

  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center space-x-3 min-w-0">
        {nameInfo.pfpUrl ? (
          <img 
            src={nameInfo.pfpUrl} 
            alt="Profile" 
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
         <RandomColorAvatar />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="font-medium truncate">{nameInfo.displayName}</p>
            {nameInfo.farcasterUsername && (
              <WarpcastLogo 
                size="md" 
                username={nameInfo.farcasterUsername} 
                className="ml-0.5 opacity-80 hover:opacity-100"
              />
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <SafeExternalLink
                  href={bid.url}
                  className={`${isBaseColors ? "text-foreground" : "text-muted-foreground"} text-xs hover:underline truncate flex items-center gap-1`}
                  onBeforeNavigate={openDialog}
                >
                  <Link2 className="h-3 w-3" />
                  {formatURL(bid.url)}
                </SafeExternalLink>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[300px]">
                <p className="break-all">{bid.url}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <p className="font-mono text-sm font-medium whitespace-nowrap ml-4">
        {formatAmount(amount, isLegacyAuction, isV2Auction, isV3Auction)}
      </p>
    </div>
  );
}
