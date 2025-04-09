import { baseSepolia, base } from "wagmi/chains";

// Check if testnets are enabled
const useTestnets = (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "true";

// App chains configuration
const chains = useTestnets ? [baseSepolia] : [base];

// Privy configuration with theme-aware colors
export const privyConfig = {
  appearance: {
    showWalletLoginFirst: true,
    accentColor: "hsl(var(--primary))", // Primary color from CSS
    logo: `https://qrcoin.fun/qrLogo.png`,
  },
  // Dark mode override - will be applied client-side
  appearanceDark: {
    accentColor: "#FFFFFF", // White for dark mode
    textColor: "#000000", // Black text for dark mode
  },
  supportedChains: chains,
  defaultChain: useTestnets ? baseSepolia : base,
  embeddedWallets: {
    createOnLogin: "users-without-wallets" as const,
  },
  loginMethods: [
    "wallet",
    "email",
  ] as const,
  walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "",
}; 