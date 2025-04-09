"use client";

import { useReadContract } from "wagmi";
import QRAuction from "../abi/QRAuction.json";
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

  const { data: auctionDetails, refetch } = useReadContract({
    address: isLegacyAuction ? process.env.NEXT_PUBLIC_QRAuction as Address : process.env.NEXT_PUBLIC_QRAuctionV2 as Address,
    abi: QRAuction.abi,
    functionName: "auction",
    args: [],
    config: wagmiConfig,
  });

  useEffect(() => {
    const fetchDetails = async () => {
      await refetch();

      if (auctionDetails) {
        // Assert that auctionDetails is of the expected type
        const details = auctionDetails as AuctionResponse;
        const bidderAddress = details[2];

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
      }
    };

    fetchDetails();
  }, [refetch, auctionDetails]);

  return { refetch, auctionDetail };
}
