"use client";
import { ethers, FallbackProvider, JsonRpcProvider } from "ethers";
import QRAuction from "../abi/QRAuction.json";
import { useClient } from "wagmi";
import { config } from "../config/config";
import type { Client, Chain, Transport } from "viem";

type AuctionType = {
  tokenId: bigint;
  bidder: string;
  amount: bigint;
  extended: boolean;
  endTime: bigint;
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

export function useFetchBids() {
  const client = useClient({ config });

  const fetchHistoricalAuctions = async () => {
    try {
      const provider = clientToProvider(client);
      const contract = new ethers.Contract(
        process.env.NEXT_PUBLIC_QRAuction as string,
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
        };
      });
      return formatted;
    } catch (error) {
      console.log("error catching events: ", error);
    }
  };

  return { fetchHistoricalAuctions };
}
