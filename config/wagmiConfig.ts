import { createConfig } from "@privy-io/wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { http } from "wagmi";
import { Chain } from "viem";

// Define World Chain
const worldChain: Chain = {
  id: 480,
  name: 'World Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [`https://worldchain-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`] },
    public: { http: [`https://worldchain-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`] },
  },
  blockExplorers: {
    default: { name: 'World Explorer', url: 'https://worldchain-mainnet.explorer.alchemy.com/' },
  },
  testnet: false,
};

// Check if testnets are enabled
const useTestnets = (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "true";

// Create the Wagmi config for Privy
export const wagmiConfig = createConfig({
  // Pass chains directly in the config without the intermediate variable
  chains: useTestnets ? [baseSepolia] : [base, worldChain],
  transports: {
    [baseSepolia.id]: http(
      `https://base-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
    [base.id]: http(
      `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    ),
    [worldChain.id]: http(`https://worldchain-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
  },
}); 