"use client";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import QRAuction from "../abi/QRAuction.json";
import { useClient } from "wagmi";
import { wagmiConfig } from "@/config/wagmiConfig";
import type { Client, Chain, Transport } from "viem";

type AuctionType = {
  tokenId: bigint;
  winner: string;
  amount: bigint;
  url: string;
};

function clientToProvider(client: Client<Transport, Chain>) {
  const { chain, transport } = client;
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  if (transport.type === "fallback") {
    const providers = (transport.transports as ReturnType<Transport>[]).map(
      ({ value }) => new JsonRpcProvider(value?.url, network)
    );
    if (providers.length === 1) return providers[0];
    return new FallbackProvider(providers);
  }
  return new JsonRpcProvider(transport.url, network);
}

export function useFetchSettledAuc(tokenId?: bigint) {
  const isLegacyAuction = tokenId && tokenId <= 22n;
  const isV2Auction = tokenId && tokenId >= 23n && tokenId <= 35n;
  const isV3Auction = tokenId && tokenId >= 36n;
  const client = useClient({
    config: wagmiConfig,
  });

  // Get the correct contract address based on tokenId
  const getContractAddress = () => {
    if (isLegacyAuction) {
      return process.env.NEXT_PUBLIC_QRAuction as string;
    } else if (isV2Auction) {
      return process.env.NEXT_PUBLIC_QRAuctionV2 as string;
    } else if (isV3Auction) {
      return process.env.NEXT_PUBLIC_QRAuctionV3 as string;
    } else {
      // Default to V3 contract for any new auctions
      return process.env.NEXT_PUBLIC_QRAuctionV3 as string;
    }
  };

  const fetchHistoricalAuctions = async () => {
    try {
      const provider = clientToProvider(client);
      const contractAddress = getContractAddress();
      const contract = new ethers.Contract(
        contractAddress,
        QRAuction.abi,
        provider
      );

      const filter = contract.filters.AuctionSettled();
      const historicalEvents = await contract.queryFilter(filter, 0, "latest");

      const formatted: AuctionType[] = await Promise.all(
        historicalEvents.map(async (event) => {
          // event.args is an array (or object) containing the event parameters.
          // Adjust indices or property names based on your ABI.

          let tokenId: bigint = 0n;
          let winner: string = "0x0000000000";
          let amount: bigint = 0n;
          let url: string = process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string;

          if ("args" in event && event.args && event.args[0]) {
            tokenId = event.args[0];
          }

          if ("args" in event && event.args && event.args[1]) {
            winner = event.args[1];
          }

          if ("args" in event && event.args && event.args[2]) {
            amount = event.args[2];
          }

          if ("args" in event && event.args && event.args[3]) {
            url =
              event.args[3] === "0x"
                ? (process.env.NEXT_PUBLIC_DEFAULT_REDIRECT as string)
                : event.args[3];
          }

          return {
            tokenId,
            winner,
            amount,
            url,
          };
        })
      );

      return formatted;
    } catch (error) {
      console.log("error catching events: ", error);
    }
  };

  return { fetchHistoricalAuctions };
}
