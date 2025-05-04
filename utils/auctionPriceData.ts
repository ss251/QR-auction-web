// Auction price data extracted from historical records
// Maps auction IDs to their spot prices

export type AuctionPriceData = {
  spotPrice: number;  // USD spot price at time of auction
  version: "v1" | "v2";
};

// Historical auction data with spot price information
export const auctionPriceData: Record<string, AuctionPriceData> = {
  // V1 Auctions (1-22)
  "1": { spotPrice: 3303.00, version: "v1" },
  "2": { spotPrice: 564.70, version: "v1" },
  "3": { spotPrice: 440.20, version: "v1" },
  "4": { spotPrice: 120.90, version: "v1" },
  "5": { spotPrice: 278.85, version: "v1" },
  "6": { spotPrice: 76.76, version: "v1" },
  "7": { spotPrice: 229.08, version: "v1" },
  "8": { spotPrice: 81.93, version: "v1" },
  "9": { spotPrice: 190.90, version: "v1" },
  "10": { spotPrice: 90.24, version: "v1" },
  "11": { spotPrice: 1047.29, version: "v1" },
  "12": { spotPrice: 231.24, version: "v1" },
  "13": { spotPrice: 584.43, version: "v1" },
  "14": { spotPrice: 514.25, version: "v1" },
  "15": { spotPrice: 59.93, version: "v1" },
  "16": { spotPrice: 190.31, version: "v1" },
  "17": { spotPrice: 150.21, version: "v1" },
  "18": { spotPrice: 100.25, version: "v1" },
  "19": { spotPrice: 137.15, version: "v1" },
  "20": { spotPrice: 103.35, version: "v1" },
  "21": { spotPrice: 48.59, version: "v1" },
  "22": { spotPrice: 110.11, version: "v1" },
  
  // V2 Auctions (23-58)
  "23": { spotPrice: 66.71, version: "v2" },
  "24": { spotPrice: 26.10, version: "v2" },
  "25": { spotPrice: 70.50, version: "v2" },
  "26": { spotPrice: 42.30, version: "v2" },
  "27": { spotPrice: 31.23, version: "v2" },
  "28": { spotPrice: 66.96, version: "v2" },
  "29": { spotPrice: 27.84, version: "v2" },
  "30": { spotPrice: 22.48, version: "v2" },
  "31": { spotPrice: 42.50, version: "v2" },
  "32": { spotPrice: 70.00, version: "v2" },
  "33": { spotPrice: 88.48, version: "v2" },
  "34": { spotPrice: 66.83, version: "v2" },
  "35": { spotPrice: 158.95, version: "v2" },
  "36": { spotPrice: 203.63, version: "v2" },
  "37": { spotPrice: 332.99, version: "v2" },
  "38": { spotPrice: 290.65, version: "v2" },
  "39": { spotPrice: 596.70, version: "v2" },
  "40": { spotPrice: 502.70, version: "v2" },
  "41": { spotPrice: 489.51, version: "v2" },
  "42": { spotPrice: 463.00, version: "v2" },
  "43": { spotPrice: 277.20, version: "v2" },
  "44": { spotPrice: 324.72, version: "v2" },
  "45": { spotPrice: 200.88, version: "v2" },
  "46": { spotPrice: 152.40, version: "v2" },
  "47": { spotPrice: 275.88, version: "v2" },
  "48": { spotPrice: 834.02, version: "v2" },
  "49": { spotPrice: 451.10, version: "v2" },
  "50": { spotPrice: 188.19, version: "v2" },
  "51": { spotPrice: 50.82, version: "v2" },
  "52": { spotPrice: 55.44, version: "v2" },
  "53": { spotPrice: 51.85, version: "v2" },
  "54": { spotPrice: 235.62, version: "v2" },
  "55": { spotPrice: 46.01, version: "v2" },
  "56": { spotPrice: 66.40, version: "v2" },
  "57": { spotPrice: 68.40, version: "v2" },
  "58": { spotPrice: 48.00, version: "v2" } // No data for auction 58 yet
};

// Helper function to get price data for a specific auction
export function getAuctionPriceData(tokenId: string | number | bigint): AuctionPriceData | null {
  const id = tokenId.toString();
  return auctionPriceData[id] || null;
}

// Helper function to determine auction version
export function getAuctionVersion(tokenId: string | number | bigint): "v1" | "v2" | null {
  const id = Number(tokenId);
  if (id >= 1 && id <= 22) return "v1";
  if (id >= 23 && id <= 58) return "v2";
  return null;
} 