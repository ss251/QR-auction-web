"use client";

import { useState, useEffect, useCallback } from "react";
import { Address } from "viem";
import { base } from "viem/chains";
import { getName } from "@coinbase/onchainkit/identity";

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
const API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY;

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

// Global auction cache to improve navigation performance
const auctionCache = new Map<string, Auction>();

export function useFetchAuctionDetailsSubgraph(tokenId?: bigint) {
  const [auctionDetail, setAuctiondetails] = useState<Auction>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAuctionFromSubgraph = useCallback(async (tokenId: bigint) => {
    // const isLegacyAuction = tokenId <= 22n;
    //const isV2Auction = tokenId >= 23n && tokenId <= 61n;
    const isV3Auction = tokenId >= 62n;

    // Determine which entity to query based on tokenId
    let entityName = "auctionSettleds";
    let bidEntityName = "auctionBids";
    let createdEntityName = "auctionCreateds";

    if (isV3Auction) {
      entityName = "qrauctionV3AuctionSettleds";
      bidEntityName = "qrauctionV3AuctionBids";
      createdEntityName = "qrauctionV3AuctionCreateds";
    }
    // Note: V2 auctions are incorrectly indexed under V1 entities

    const query = `
      query GetAuctionDetails($tokenId: BigInt!) {
        ${entityName}(where: { tokenId: $tokenId }) {
          id
          tokenId
          winner
          amount
          urlString
          ${isV3Auction ? 'name' : ''}
          blockTimestamp
        }
        ${createdEntityName}(where: { tokenId: $tokenId }) {
          id
          tokenId
          startTime
          endTime
          blockTimestamp
        }
        ${bidEntityName}(
          where: { tokenId: $tokenId }
          orderBy: amount
          orderDirection: desc
          first: 1
        ) {
          id
          tokenId
          bidder
          amount
          endTime
          urlString
          ${isV3Auction ? 'name' : ''}
          blockTimestamp
        }
      }
    `;

    const response = await fetch(SUBGRAPH_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        query,
        variables: {
          tokenId: tokenId.toString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph request failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Subgraph query error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }, []);

  const fetchDetails = useCallback(async () => {
    if (!tokenId) return;

    const cacheKey = `${tokenId}-subgraph`;

    // Check cache first
    if (auctionCache.has(cacheKey)) {
      setAuctiondetails(auctionCache.get(cacheKey));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchAuctionFromSubgraph(tokenId);

      const isV3Auction = tokenId >= 62n;
      const settledKey = isV3Auction ? 'qrauctionV3AuctionSettleds' : 'auctionSettleds';
      const createdKey = isV3Auction ? 'qrauctionV3AuctionCreateds' : 'auctionCreateds';
      const bidKey = isV3Auction ? 'qrauctionV3AuctionBids' : 'auctionBids';

      const settled = data[settledKey]?.[0];
      const created = data[createdKey]?.[0];
      const highestBid = data[bidKey]?.[0];

      if (!created) {
        throw new Error(`No auction found with tokenId ${tokenId}`);
      }

      // Build auction object
      const auction: Auction = {
        tokenId: BigInt(created.tokenId),
        highestBid: highestBid ? BigInt(highestBid.amount) : 0n,
        highestBidder: highestBid?.bidder || settled?.winner || "0x0000000000000000000000000000000000000000",
        startTime: BigInt(created.startTime),
        endTime: BigInt(created.endTime),
        settled: !!settled,
        qrMetadata: {
          validUntil: BigInt(created.endTime),
          urlString: highestBid?.urlString || settled?.urlString || "",
        },
      };

      // For V3 auctions, use the name from the subgraph
      if (isV3Auction && (highestBid?.name || settled?.name)) {
        auction.highestBidderName = highestBid?.name || settled?.name;
      }

      setAuctiondetails(auction);
      auctionCache.set(cacheKey, auction);

      // For V1/V2 auctions or if V3 doesn't have a name, fetch ENS/basename asynchronously
      if (!auction.highestBidderName && auction.highestBidder !== "0x0000000000000000000000000000000000000000") {
        try {
          const name = await getName({
            address: auction.highestBidder as Address,
            chain: base,
          });

          if (name) {
            const updatedAuction = {
              ...auction,
              highestBidderName: name,
            };
            setAuctiondetails(updatedAuction);
            auctionCache.set(cacheKey, updatedAuction);
          }
        } catch (nameError) {
          console.error("Error fetching ENS/basename:", nameError);
        }
      }
    } catch (err) {
      console.error("Error fetching auction details from subgraph:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [tokenId, fetchAuctionFromSubgraph]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const forceRefetch = useCallback(async () => {
    if (!tokenId) return;

    const cacheKey = `${tokenId}-subgraph`;
    auctionCache.delete(cacheKey);

    await fetchDetails();
  }, [tokenId, fetchDetails]);

  return { 
    auctionDetail, 
    refetch: fetchDetails, 
    forceRefetch, 
    loading, 
    error 
  };
}
