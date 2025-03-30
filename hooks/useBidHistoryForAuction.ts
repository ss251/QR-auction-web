"use client";

import { useState, useEffect } from 'react';
import { useFetchBids } from './useFetchBids';

type Bid = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
  _id: string;
};

/**
 * Hook to get the bid history for a specific auction
 * @param auctionId The auction ID to get bids for
 * @returns An object containing the bids and loading state
 */
export function useBidHistoryForAuction(auctionId: bigint) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { fetchHistoricalAuctions } = useFetchBids(auctionId);
  
  useEffect(() => {
    const fetchBids = async () => {
      setIsLoading(true);
      try {
        const allBids = await fetchHistoricalAuctions();
        if (allBids) {
          // Filter bids for this specific auction
          const auctionBids = allBids.filter(
            bid => bid.tokenId === auctionId
          );
          
          // Sort bids by amount (highest first)
          auctionBids.sort((a, b) => {
            if (a.amount < b.amount) return 1;
            if (a.amount > b.amount) return -1;
            return 0;
          });
          
          setBids(auctionBids);
        } else {
          setBids([]);
        }
      } catch (error) {
        console.error('Error fetching bids for auction:', error);
        setBids([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBids();
  }, [auctionId, fetchHistoricalAuctions]);
  
  return { bids, isLoading };
} 