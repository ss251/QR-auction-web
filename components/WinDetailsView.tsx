/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { formatEther, formatUnits } from "viem";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";
import { useEffect, useState, useMemo } from "react";
import { RandomColorAvatar } from "./RandomAvatar";
import { SafeExternalLink } from "./SafeExternalLink";
import { ExternalLink } from "lucide-react";
import { formatURL } from "@/utils/helperFunctions";
import { formatQRAmount, formatUsdValue } from "@/utils/formatters";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { WarpcastLogo } from "@/components/WarpcastLogo";
import { getFarcasterUser } from "@/utils/farcaster";
import { useBaseColors } from "@/hooks/useBaseColors";
import useEthPrice from "@/hooks/useEthPrice";
import { getAuctionVersion } from "@/utils/auctionPriceData";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
  openDialog: (url: string) => boolean;
  openBids: () => void;
};

export function WinDetailsView(winnerdata: AuctionType) {
  const isBaseColors = useBaseColors();
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [nameInfo, setNameInfo] = useState<{ pfpUrl?: string; displayName: string; farcasterUsername?: string }>({
    displayName: `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`,
  });
  const [winnerDbData, setWinnerDbData] = useState<{ usd_value: number | null, is_v1_auction: boolean | null } | null>(null);
  
  // Determine auction version
  const auctionVersion = useMemo(() => getAuctionVersion(winnerdata.tokenId), [winnerdata.tokenId]);
  
  // Fallback to current prices if database data isn't available
  const { priceUsd: qrPrice } = useTokenPrice();
  const { ethPrice } = useEthPrice();

  // Determine auction version
  const isV1Auction = auctionVersion === "v1";
  const isV2Auction = auctionVersion === "v2";
  const isV3Auction = auctionVersion === "v3";
  
  // Calculate token amount from blockchain data
  const tokenAmount = useMemo(() => {
    if (isV3Auction) {
      return Number(formatUnits(winnerdata.amount, 6)); // USDC has 6 decimals
    }
    return Number(formatEther(winnerdata.amount)); // ETH and QR have 18 decimals
  }, [winnerdata.amount, isV3Auction]);

  // Fetch winner data from database
  useEffect(() => {
    const fetchWinnerData = async () => {
      try {
        const { data, error } = await supabase
          .from('winners')
          .select('usd_value, is_v1_auction')
          .eq('token_id', winnerdata.tokenId.toString())
          .single();
        
        if (error) {
          console.error('Error fetching winner data:', error);
          return;
        }
        
        if (data) {
          setWinnerDbData(data);
        }
      } catch (error) {
        console.error('Error in database query:', error);
      }
    };
    
    fetchWinnerData();
  }, [winnerdata.tokenId]);

  useEffect(() => {
    const fetchData = async () => {
      const name = await getName({
        address: winnerdata.winner as Address,
        chain: base,
      });

      // Fetch Farcaster data
      const farcasterUser = await getFarcasterUser(winnerdata.winner);
      
      // Quick temp fix - replace !217978 with softwarecurator
      const fixedName = name === "!217978" ? "softwarecurator" : name;
      const fixedUsername = farcasterUser?.username === "!217978" ? "softwarecurator" : farcasterUser?.username;
      
      setNameInfo({
        displayName: fixedName || `${winnerdata.winner.slice(0, 4)}...${winnerdata.winner.slice(-4)}`,
        pfpUrl: farcasterUser?.pfpUrl,
        farcasterUsername: fixedUsername
      });
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerdata.tokenId]);

  useEffect(() => {
    async function fetchOgImage() {
      try {
        // Map of auction IDs to custom image URLs
        const auctionImageOverrides: Record<string, string> = {
          "1": "https://i.imgur.com/aZfUcoo.png",
          "4": "https://i.imgur.com/DkzUJvK.png",
          "5": "https://i.imgur.com/3KoEvNG.png",
          "7": "https://i.imgur.com/fzojQUs.png",
          "9": "https://i.imgur.com/Ryd5FD6.png",
          "13": "https://i.imgur.com/RcjPf8D.png",
          "14": "https://i.imgur.com/4KcwIzj.png",
          "15": "https://i.imgur.com/jyo2f0H.jpeg",
          "20": "https://i.imgur.com/8qNqYIV.png",
          "22": "https://i.imgur.com/21yjB2x.png",
          "23": "https://i.imgur.com/5gCWL3S.png",
          "24": "https://i.imgur.com/Q5UspzS.png",
          "25": "https://i.imgur.com/no5pC8v.png",
          "27": "https://i.postimg.cc/2SgbbqFr/qr-27-winner.png",
          "29": "https://i.postimg.cc/zDg3CxBW/elon5050.png",
          "30": "https://i.postimg.cc/tRkFGkKL/Group-424.png",
          "32": "https://i.postimg.cc/tRkFGkKL/Group-424.png",
          "33": "https://i.postimg.cc/mhWtNxTw/34winner.png",
          "34": "https://i.postimg.cc/wBfV58jL/35winner.png",
          "37": "https://i.postimg.cc/RZfJ9hsX/winner37.jpg",
          "39": "https://i.postimg.cc/rpxzhzbX/winner39.png",
          "42": "https://i.postimg.cc/bwGJ6JKy/42winner.jpg",
          "43": "https://i.postimg.cc/wTDHNwnp/43winner.jpg",
          "45": "https://i.postimg.cc/DzRKLWrW/45winner.jpg"
        };

        // Check if we have a custom image override for this auction
        const tokenIdStr = winnerdata.tokenId.toString();
        if (auctionImageOverrides[tokenIdStr]) {
          setOgImage(auctionImageOverrides[tokenIdStr]);
          return;
        }
        
        const res = await fetch(`/api/og?url=${winnerdata.url}`);
        const data = await res.json();
        console.log(data);
        if (data.error) {
          setOgImage(
            `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
          );
        } else {
          if (data.image !== "") {
            setOgImage(data.image);
          } else {
            setOgImage(
              `${String(process.env.NEXT_PUBLIC_HOST_URL)}/opgIMage.png`
            );
          }
        }
      } catch (err) {
      } finally {
      }
    }
    fetchOgImage();
  }, [winnerdata.url, winnerdata.tokenId]);

  // Helper function to format bid amount based on auction type
  const formatBidAmount = () => {
    if (isV3Auction) {
      // For V3, show USDC format
      return `$${tokenAmount.toFixed(2)}`;
    } else if (isV1Auction) {
      return `${formatQRAmount(tokenAmount)} ETH`;
    } else {
      return `${formatQRAmount(tokenAmount)} $QR`;
    }
  };

  // Helper function to format value in USD
  const formatUsdValueDisplay = (): string => {
    // If we have database value, use it
    if (winnerDbData?.usd_value) {
      return `($${winnerDbData.usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    } 
    
    // Don't show USD value for V3 since amount is already in USD
    if (isV3Auction) {
      return '';
    }
    
    // Fallback to calculating with current prices
    if (isV1Auction && ethPrice?.ethereum?.usd) {
      const currentUsdValue = tokenAmount * ethPrice.ethereum.usd;
      return `($${currentUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    } else if (isV2Auction && qrPrice) {
      const currentUsdValue = tokenAmount * qrPrice;
      return `(${formatUsdValue(currentUsdValue)})`;
    }
    
    return '';
  };

  return (
    <>
      <div className="flex flex-row justify-between items-start gap-1">
        <div className="">
          <div className="flex flex-row gap-2">
            <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Winning bid</div>
            <button
              onClick={winnerdata.openBids}
              className={`${isBaseColors ? "text-foreground underline" : "text-gray-600 dark:text-[#696969] underline"} text-left`}
            >
              see bids
            </button>
          </div>
          <div className="inline-flex flex-row justify-center items-center gap-1">
            <div className="text-xl font-bold">
              {formatBidAmount()} {formatUsdValueDisplay()}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end" style={{ minWidth: '160px', maxWidth: '200px' }}>
          <div className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"} w-full text-right mb-1`}>Won by</div>
          <div className="flex justify-end items-center w-full">
            {nameInfo.pfpUrl ? (
              <img 
                src={nameInfo.pfpUrl} 
                alt="Profile" 
                className="w-6 h-6 rounded-full object-cover mr-1 flex-shrink-0"
              />
            ) : (
              <div className="mr-2 flex-shrink-0">
                <RandomColorAvatar />
              </div>
            )}
            
            {nameInfo.farcasterUsername ? (
              <div className="flex items-center overflow-hidden">
                <div className="text-right whitespace-nowrap text-ellipsis overflow-hidden max-w-[170px]">
                  @{nameInfo.farcasterUsername}
                </div>
                <WarpcastLogo 
                  size="md" 
                  username={nameInfo.farcasterUsername} 
                  className="ml-1 flex-shrink-0"
                />
              </div>
            ) : (
              <span className="truncate max-w-[170px] text-right">
                {nameInfo.displayName}
              </span>
            )}
          </div>
        </div>
      </div>

      {winnerdata.url !== "" && winnerdata.url !== "0x" && (
        <div className={`${isBaseColors ? "bg-background" : "bg-green-50 border border-green-100"} flex flex-col mt-6 p-3 rounded-md h-full md:h-[236px]`}>
          <div className="inline-flex flex-row justify-between items-center w-full">
            <div className="text-sm w-full overflow-hidden">
              <span className={`${isBaseColors ? "text-foreground" : "text-gray-600 dark:text-[#696969]"}`}>Winner: </span>
              <SafeExternalLink
                href={winnerdata.url}
                className={`${isBaseColors ? "text-foreground" : "text-gray-700 hover:text-gray-900"} transition-colors inline-flex items-center max-w-[calc(100%-65px)]`}
                onBeforeNavigate={() => false}
              >
                <span className="truncate inline-block align-middle">
                  {formatURL(winnerdata.url, true, true, 280)}
                </span>
                <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
              </SafeExternalLink>
            </div>
          </div>
          <div className={`${isBaseColors ? "bg-background" : "bg-white"} flex flex-col rounded-md justify-center items-center h-full mt-1 w-full overflow-hidden aspect-[2/1]`}>
            {ogImage && (
              <img
                src={ogImage}
                alt="Open Graph"
                className="h-auto w-full"
                onClick={() => {
                  window.location.href = winnerdata.url;
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
