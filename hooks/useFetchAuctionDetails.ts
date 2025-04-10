"use client";

import { useReadContract } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
import QRAuctionV2 from "../abi/QRAuctionV2.json";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { Address } from "viem";
import { wagmiConfig } from "@/config/wagmiConfig";
import { useEffect, useState } from "react";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";

type QRData = {
  validUntil: bigint;
  urlString: string;
};

type Auction = {
  tokenId: bigint;
  highestBid: bigint;
  highestBidder: string;
  highestBidderName?: string;
  startTime: bigint;
  endTime: bigint;
  settled: boolean;
  qrMetadata: QRData;
};

type AuctionResponse = [
  tokenId: bigint,
  highestBid: bigint,
  highestBidder: string,
  startTime: bigint,
  endTime: bigint,
  settled: boolean,
  qrMetadata: QRData
];

export function useFetchAuctionDetails(tokenId?: bigint) {
  const [auctionDetail, setAuctiondetails] = useState<Auction>();
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 35n;
  const isV3Auction = tokenId && tokenId >= 36n;
  
  // Determine the correct contract address and ABI based on tokenId
  const contractAddress = isLegacyAuction 
    ? process.env.NEXT_PUBLIC_QRAuction as Address 
    : isV2Auction 
      ? process.env.NEXT_PUBLIC_QRAuctionV2 as Address 
      : isV3Auction 
        ? process.env.NEXT_PUBLIC_QRAuctionV3 as Address 
        : process.env.NEXT_PUBLIC_QRAuctionV3 as Address; // Default to V3 for any new auctions
  
  const contractAbi = isLegacyAuction 
    ? QRAuction.abi 
    : isV2Auction 
      ? QRAuctionV2.abi 
      : QRAuctionV3.abi;

  console.log(`Using contract for auction #${tokenId}: ${contractAddress}, version: ${
    isLegacyAuction ? 'V1' : isV2Auction ? 'V2' : 'V3'
  }`);
  
  const { data: auctionDetails, refetch, error: contractReadError } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: "auction",
    args: [],
    config: wagmiConfig,
  });

  // Log any contract read errors
  useEffect(() => {
    if (contractReadError) {
      console.error("Contract read error:", contractReadError);
    }
  }, [contractReadError]);

  useEffect(() => {
    const fetchDetails = async () => {
      console.log(`Fetching auction details for token #${tokenId} from contract ${contractAddress}`);
      
      try {
        const result = await refetch();
        console.log("Refetch result:", result);

        if (auctionDetails) {
          // Assert that auctionDetails is of the expected type
          const details = auctionDetails as AuctionResponse;
          const bidderAddress = details[2];
          
          console.log(`Auction data:`, {
            tokenId: details[0].toString(),
            highestBid: details[1].toString(),
            highestBidder: bidderAddress,
            startTime: details[3].toString(),
            endTime: details[4].toString(),
            settled: details[5]
          });

          try {
            // Get basename for display purposes only
            const name = await getName({
              address: bidderAddress as Address,
              chain: base,
            });

            setAuctiondetails({
              tokenId: details[0],
              highestBid: details[1],
              highestBidder: bidderAddress,
              highestBidderName: name || undefined,
              startTime: details[3],
              endTime: details[4],
              settled: details[5],
              qrMetadata: details[6],
            });
          } catch (nameError) {
            console.error("Error fetching name:", nameError);
            // Still set the auction details even if name resolution fails
            setAuctiondetails({
              tokenId: details[0],
              highestBid: details[1],
              highestBidder: bidderAddress,
              startTime: details[3],
              endTime: details[4],
              settled: details[5],
              qrMetadata: details[6],
            });
          }
        } else {
          console.log("No auction details returned");
        }
      } catch (error) {
        console.error("Error fetching auction details:", error);
      }
    };

    if (tokenId) {
      fetchDetails();
    }
  }, [refetch, auctionDetails, tokenId, contractAddress]);

  return { refetch, auctionDetail, contractReadError };
}
