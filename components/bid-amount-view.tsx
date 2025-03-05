/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { z } from "zod";
import { formatEther } from "viem";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { waitForTransactionReceipt } from "@wagmi/core";
import { toast } from "sonner";
import { useWriteActions } from "@/hooks/useWriteActions";
import { parseUnits } from "viem";
import { config } from "@/config/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "wagmi";

export function BidForm({
  auctionDetail,
  settingDetail,
  onSuccess,
}: {
  auctionDetail: any;
  settingDetail: any;
  onSuccess: () => void;
}) {
  const { isConnected } = useAccount();
  const { bidAmount } = useWriteActions({
    tokenId: auctionDetail?.tokenId ? auctionDetail.tokenId : 0n,
  });

  // Calculate the minimum bid value from the contract data
  const minimumBid = Number(
    formatEther(auctionDetail?.highestBid ? auctionDetail.highestBid : 0n)
  );

  // Define the schema using the computed minimum
  const formSchema = z.object({
    bid: z.coerce
      .number({
        invalid_type_error: "Bid must be a number",
      })
      .min(
        Number((minimumBid + 0.001).toFixed(3)),
        `Bid must be at least ${(minimumBid + 0.001).toFixed(3)}`
      ),
    url: z.string().url("Invalid URL"),
  });

  type FormSchemaType = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
    mode: "onChange", // Validate as the user types
  });

  const onSubmit = async (data: FormSchemaType) => {
    console.log("Form data:", data);

    if (!isConnected) {
      toast.error("Connect a wallet");
      return;
    }

    try {
      const hash = await bidAmount({
        value: parseUnits(`${data.bid}`, 18),
        urlString: data.url,
      });

      const transactionReceiptPr = waitForTransactionReceipt(config, {
        hash: hash,
      });

      toast.promise(transactionReceiptPr, {
        loading: "Executing Transaction...",
        success: (data: any) => {
          reset();
          onSuccess();
          return "Bid Successfull";
        },
        error: (data: any) => {
          return "Failed to create bid";
        },
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-2 mb-4">
        <div className="relative flex-1">
          <Input
            type="number"
            min={(minimumBid + 0.001).toFixed(3)}
            step="any"
            placeholder={`${(minimumBid + 0.001).toFixed(3)} or more`}
            className="pr-16 border p-2 w-full"
            {...register("bid")}
          />
          <div className="absolute inset-y-0 right-7 flex items-center pointer-events-none text-gray-500 h-[36px]">
            ETH
          </div>
          {errors.bid && (
            <p className="text-red-500 text-sm mt-1">{errors.bid.message}</p>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type="text"
              placeholder="https://"
              className="pr-16 border p-2 w-full"
              {...register("url")}
            />
            <div className="absolute inset-y-0 right-7 flex items-center pointer-events-none text-gray-500 h-[36px]">
              URL
            </div>
            {errors.url && (
              <p className="text-red-500 text-sm mt-1">{errors.url.message}</p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className={`px-8 py-2 text-white ${
            isValid ? "bg-gray-900 hover:bg-gray-800" : "bg-gray-500"
          }`}
          disabled={!isValid}
        >
          Place Bid
        </Button>
      </div>
    </form>
  );
}
