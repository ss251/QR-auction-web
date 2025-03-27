"use client";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import QRAuction from "../abi/QRAuction.json";
import { useClient } from "wagmi";
import { config } from "../config/config";
import type { Client, Chain, Transport } from "viem";
import { v4 as uuidv4 } from "uuid";

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
  url: string;
  _id: string;
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

export function useFetchBids(tokenId?: bigint) {
  const client = useClient({ config });
  const isLegacyAuction = tokenId && tokenId <= 22n;
  
  const fetchHistoricalAuctions = async () => {
    try {
      const provider = clientToProvider(client);
      const contract = new ethers.Contract(
        isLegacyAuction ? process.env.NEXT_PUBLIC_QRAuction as string : process.env.NEXT_PUBLIC_QRAuctionV2 as string,
        QRAuction.abi,
        provider
      );

      const filter = contract.filters.AuctionBid();
      const historicalEvents = await contract.queryFilter(filter, 0, "latest");

      const formatted: AuctionType[] = historicalEvents.map((event) => {
        // event.args is an array (or object) containing the event parameters.
        // Adjust indices or property names based on your ABI.

        let tokenId: bigint = 0n;
        let bidder: string = "0x";
        let amount: bigint = 0n;
        let extended: boolean = false;
        let endTime: bigint = 0n;
        let url: string = "";
        const _id: string = uuidv4();

        if ("args" in event && event.args && event.args[0]) {
          tokenId = event.args[0];
        }

        if ("args" in event && event.args && event.args[1]) {
          bidder = event.args[1];
        }

        if ("args" in event && event.args && event.args[2]) {
          amount = event.args[2];
        }

        if ("args" in event && event.args && event.args[3]) {
          extended = event.args[3];
        }

        if ("args" in event && event.args && event.args[4]) {
          endTime = event.args[4];
        }

        if ("args" in event && event.args && event.args[5]) {
          url = event.args[5];
        }

        return {
          tokenId,
          bidder,
          amount,
          extended,
          endTime,
          url,
          _id,
        };
      });
      return formatted;
    } catch (error) {
      console.log("error catching events: ", error);
    }
  };

  return { fetchHistoricalAuctions };
}
