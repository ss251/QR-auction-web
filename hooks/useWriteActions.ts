/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { Address } from "viem";
import { useWriteContract } from "wagmi";
import { USDC_TOKEN_ADDRESS } from "@/config/tokens";

// ERC20 ABI for token approval
const erc20ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export function useWriteActions({ tokenId }: { tokenId: bigint }) {
  // Setup contract writes
  const { writeContractAsync: bidAuction } = useWriteContract();
  const { writeContractAsync: settleAndCreate } = useWriteContract();
  const { writeContractAsync: approveToken } = useWriteContract();

  // Determine which auction version we're dealing with
  const isLegacyAuction = tokenId <= 22n;
  const isV2Auction = tokenId >= 23n && tokenId <= 35n;

  // For V1 and V2 auctions, provide disabled versions of the functions
  if (isLegacyAuction || isV2Auction) {
    const readOnlyMessage = `Auction #${tokenId} is read-only. Only the latest V3 auctions can be interacted with.`;
    
    return {
      bidAmount: async () => {
        throw new Error(readOnlyMessage);
      },
      settleTxn: async () => {
        throw new Error(readOnlyMessage);
      }
    };
  }
  
  // Only V3 auctions can be interacted with
  const bidAmount = async ({
    value,
    urlString,
  }: {
    value: bigint;
    urlString: string;
  }) => {
    try {
      console.log(`Bidding on V3 auction #${tokenId.toString()}`);
      console.log(`Using USDC token, address: ${USDC_TOKEN_ADDRESS}`);
      
      // First approve USDC tokens to be spent by the auction contract
      console.log("Approving USDC tokens:", value.toString());
      const approveTx = await approveToken({
        address: USDC_TOKEN_ADDRESS as Address,
        abi: erc20ABI,
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value],
      });
      
      console.log("Approval tx:", approveTx);

      // Wait for approval to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Use the 3-parameter version of createBid instead of the backward compatibility one
      console.log("Placing bid with URL:", urlString);
      const tx = await bidAuction({
        address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
        abi: QRAuctionV3.abi,
        functionName: "createBid",
        args: [tokenId, urlString, ""], // Add empty string as name parameter
      });

      return tx;
    } catch (error: any) {
      console.error("Bid error:", error);
      throw error;
    }
  };

  const settleTxn = async () => {
    try {
      console.log(`Settling V3 auction #${tokenId.toString()}`);
      
      const tx = await settleAndCreate({
        address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
        abi: QRAuctionV3.abi,
        functionName: "settleCurrentAndCreateNewAuction",
        args: [],
      });

      return tx;
    } catch (error: any) {
      console.error("Settlement error:", error);
      throw error;
    }
  };

  return { bidAmount, settleTxn };
}
