/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import QRAuctionV3 from "../abi/QRAuctionV3.json";
import { Address, encodeFunctionData } from "viem";
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
    smartWalletClient,
    onPhaseChange
  }: {
    value: bigint;
    urlString: string;
    smartWalletClient?: any;
    onPhaseChange?: (phase: 'approving' | 'confirming' | 'executing') => void;
  }) => {
    try {
      console.log(`Bidding on V3 auction #${tokenId.toString()}`);
      console.log(`Using USDC token, address: ${USDC_TOKEN_ADDRESS}`);
      
      // Check if we're in Warpcast
      const isWarpcast = typeof navigator !== 'undefined' && 
        (navigator.userAgent.toLowerCase().includes('warpcast') || 
         window.location.href.includes('frame.warpcast.com'));
      console.log("Bidding environment:", { isWarpcast });
      
      // Check if we have a smart wallet client
      if (smartWalletClient) {
        console.log("Using smart wallet for transaction");
        
        // First approve USDC tokens to be spent by the auction contract using the smart wallet
        console.log("Approving USDC tokens with smart wallet:", value.toString());
        
        // Use smart wallet for approval
        const approveTxData = {
          address: USDC_TOKEN_ADDRESS as Address,
          abi: erc20ABI,
          functionName: "approve",
          args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value],
        };
        
        const approveTx = await smartWalletClient.writeContract(approveTxData);
        console.log("Smart wallet approval tx:", approveTx);
        
        // Wait for approval to complete
        await new Promise(resolve => setTimeout(resolve, 5000));
        onPhaseChange?.('executing');
        
        // Use the 3-parameter version of createBid instead of the backward compatibility one
        console.log("Placing bid with smart wallet and URL:", urlString);
        
        const bidTxData = {
          address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
          abi: QRAuctionV3.abi,
          functionName: "createBid",
          args: [tokenId, urlString, ""], // Add empty string as name parameter
        };
        
        const tx = await smartWalletClient.writeContract(bidTxData);
        return tx;
      } else if (isWarpcast && typeof window !== 'undefined' && (window as any).sdk?.wallet?.ethProvider) {
        // Use direct Warpcast wallet integration
        try {
          console.log("Using Warpcast wallet for bidding");
          onPhaseChange?.('approving');
          
          // Access global Farcaster SDK
          const farcasterSdk = (window as any).sdk;
          
          if (!farcasterSdk?.wallet?.ethProvider) {
            throw new Error("Farcaster SDK wallet not available");
          }
          
          // Make sure SDK is ready
          await farcasterSdk.actions.ready();
          
          // Get connected accounts
          const accounts = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_accounts",
          });
          
          // Request connection if needed
          if (!Array.isArray(accounts) || accounts.length === 0) {
            console.log("No accounts connected, requesting access...");
            const requestedAccounts = await farcasterSdk.wallet.ethProvider.request({
              method: "eth_requestAccounts",
            });
            
            if (!Array.isArray(requestedAccounts) || requestedAccounts.length === 0) {
              throw new Error("Failed to connect Warpcast wallet");
            }
          }
          
          // Get accounts again after possible connection
          const connectedAccounts = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_accounts",
          });
          
          if (!Array.isArray(connectedAccounts) || connectedAccounts.length === 0) {
            throw new Error("No Warpcast wallet connected");
          }
          
          const fromAddress = connectedAccounts[0];
          console.log("Using Warpcast wallet address:", fromAddress);
          
          // First need to approve USDC spending
          console.log("Approving USDC tokens with Warpcast wallet:", value.toString());
          
          // Properly encode approval call data
          const approveData = encodeFunctionData({
            abi: erc20ABI,
            functionName: "approve",
            args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value]
          });
          
          // Create approval transaction parameters
          const approveTxParams = {
            from: fromAddress,
            to: USDC_TOKEN_ADDRESS,
            data: approveData,
          };
          
          // Send approval transaction
          const approveTxHash = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_sendTransaction",
            params: [approveTxParams],
          });
          
          console.log("Warpcast USDC approval transaction sent:", approveTxHash);
          
          // Wait for approval confirmation
          onPhaseChange?.('confirming');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Now create the bid transaction
          onPhaseChange?.('executing');
          
          // Encode bid function call data (tokenId, urlString, empty name)
          const bidData = encodeFunctionData({
            abi: QRAuctionV3.abi,
            functionName: "createBid",
            args: [tokenId, urlString, ""]
          });
          
          // Create bid transaction parameters
          const bidTxParams = {
            from: fromAddress,
            to: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
            data: bidData,
          };
          
          // Send bid transaction
          const bidTxHash = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_sendTransaction",
            params: [bidTxParams],
          });
          
          console.log("Warpcast bid transaction sent:", bidTxHash);
          return bidTxHash;
        } catch (warpcastError) {
          console.error("Warpcast bidding error:", warpcastError);
          console.log("Falling back to regular bidding");
          // Fall through to regular EOA path
        }
      }
      
      // Use regular EOA wallet - this path still needs approval
      console.log("Using EOA wallet for transaction");
      
      // Notify that we're in approval phase
      onPhaseChange?.('approving');
      
      // First approve USDC tokens to be spent by the auction contract
      console.log("Approving USDC tokens with EOA:", value.toString());
      const approveTx = await approveToken({
        address: USDC_TOKEN_ADDRESS as Address,
        abi: erc20ABI,
        functionName: "approve",
        args: [process.env.NEXT_PUBLIC_QRAuctionV3 as Address, value],
      });
      
      console.log("Approval tx:", approveTx);

      // Wait for approval to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Notify that we're in confirmation phase
      onPhaseChange?.('confirming');
      
      // Use the 3-parameter version of createBid instead of the backward compatibility one
      console.log("Placing bid with EOA and URL:", urlString);
      const tx = await bidAuction({
        address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
        abi: QRAuctionV3.abi,
        functionName: "createBid",
        args: [tokenId, urlString, ""], // Add empty string as name parameter
      });

      // After submitting the transaction, move to executing phase
      onPhaseChange?.('executing');
      return tx;
    } catch (error: any) {
      console.error("Bid error:", error);
      throw error;
    }
  };

  const settleTxn = async ({ smartWalletClient }: { smartWalletClient?: any } = {}) => {
    try {
      console.log(`Settling V3 auction #${tokenId.toString()}`);
      
      // First check if we're in Warpcast
      const isWarpcast = typeof navigator !== 'undefined' && 
        (navigator.userAgent.toLowerCase().includes('warpcast') || 
         window.location.href.includes('frame.warpcast.com'));
      console.log("Settlement environment:", { isWarpcast });
      
      if (smartWalletClient) {
        console.log("Using smart wallet for settlement");
        
        const settleTxData = {
          address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
          abi: QRAuctionV3.abi,
          functionName: "settleCurrentAndCreateNewAuction",
          args: [],
        };
        
        const tx = await smartWalletClient.writeContract(settleTxData);
        return tx;
      } else if (isWarpcast && typeof window !== 'undefined' && (window as any).sdk?.wallet?.ethProvider) {
        // Use direct Warpcast wallet integration
        try {
          console.log("Using Warpcast wallet for settlement");
          
          // Access global Farcaster SDK
          const farcasterSdk = (window as any).sdk;
          
          if (!farcasterSdk?.wallet?.ethProvider) {
            throw new Error("Farcaster SDK wallet not available");
          }
          
          // Make sure SDK is ready
          await farcasterSdk.actions.ready();
          
          // Get connected accounts
          const accounts = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_accounts",
          });
          
          // Request connection if needed
          if (!Array.isArray(accounts) || accounts.length === 0) {
            console.log("No accounts connected, requesting access...");
            const requestedAccounts = await farcasterSdk.wallet.ethProvider.request({
              method: "eth_requestAccounts",
            });
            
            if (!Array.isArray(requestedAccounts) || requestedAccounts.length === 0) {
              throw new Error("Failed to connect Warpcast wallet");
            }
          }
          
          // Get accounts again after possible connection
          const connectedAccounts = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_accounts",
          });
          
          if (!Array.isArray(connectedAccounts) || connectedAccounts.length === 0) {
            throw new Error("No Warpcast wallet connected");
          }
          
          const fromAddress = connectedAccounts[0];
          console.log("Using Warpcast wallet address:", fromAddress);
          
          // Encode settlement function call data (no parameters needed)
          const settleData = encodeFunctionData({
            abi: QRAuctionV3.abi,
            functionName: "settleCurrentAndCreateNewAuction",
            args: []
          });
          
          // Create transaction parameters
          const txParams = {
            from: fromAddress,
            to: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
            data: settleData,
          };
          
          // Send transaction
          const txHash = await farcasterSdk.wallet.ethProvider.request({
            method: "eth_sendTransaction",
            params: [txParams],
          });
          
          console.log("Warpcast settlement transaction sent:", txHash);
          return txHash;
        } catch (warpcastError) {
          console.error("Warpcast settlement error:", warpcastError);
          console.log("Falling back to regular settlement");
          // Fall through to regular EOA path
        }
      }
      
      // If we're here, either we're not in Warpcast or the Warpcast settlement failed
      console.log("Using regular EOA wallet for settlement via useWriteContract");
      console.log("Contract address:", process.env.NEXT_PUBLIC_QRAuctionV3);
      
      try {
        const tx = await settleAndCreate({
          address: process.env.NEXT_PUBLIC_QRAuctionV3 as Address,
          abi: QRAuctionV3.abi,
          functionName: "settleCurrentAndCreateNewAuction",
          args: [],
        });
        
        console.log("Transaction successful:", tx);
        return tx;
      } catch (error: any) {
        console.error("Settlement transaction error:", error);
        console.error("Error message:", error.message);
        console.error("Error details:", JSON.stringify(error, null, 2));
        throw error;
      }
    } catch (error: any) {
      console.error("Settlement error:", error);
      throw error;
    }
  };

  return { bidAmount, settleTxn };
}
