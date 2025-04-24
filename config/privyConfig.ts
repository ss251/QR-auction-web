import { baseSepolia, base } from "wagmi/chains";

// Check if testnets are enabled
const useTestnets = (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "true";

// App chains configuration
const chains = useTestnets ? [baseSepolia] : [base];

// This is a simpler and more reliable way to check for Farcaster frames
// We only have a few reliable checks we can use server-side and client-side
const isInFarcasterFrame = () => {
  
  // Check URL parameters which is the most reliable method for frames
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has('fc') || searchParams.has('farcaster')) {
    return true;
  }
  
  // Check for Warpcast in user agent (for mini-apps)
  const userAgent = window.navigator.userAgent || '';
  if (userAgent.toLowerCase().includes('warpcast')) {
    return true;
  }
  
  return false;
};

// Export this function so it can be used in other components if needed
export { isInFarcasterFrame };

// Privy configuration with theme-aware colors
export const privyConfig = {
  appearance: {
    showWalletLoginFirst: true,
    accentColor: "hsl(var(--primary))", // Primary color from CSS
    logo: `https://qrcoin.fun/qrLogo.png`,
    // In Farcaster frames, only use Warpcast wallet
    // In regular web, use the specified wallet order
    walletList: isInFarcasterFrame() 
      ? ['detected_ethereum_wallets'] // Show wallets that are available in Farcaster frames
      : ['coinbase_wallet', 'rainbow', 'metamask', 'wallet_connect'],
    // Don't show recent wallets in frames
  },
  // Dark mode override - will be applied client-side
  appearanceDark: {
    accentColor: "#FFFFFF", // White for dark mode
    textColor: "#000000", // Black text for dark mode
  },
  supportedChains: chains,
  defaultChain: useTestnets ? baseSepolia : base,
  embeddedWallets: {
    // Don't create embedded wallets on login for frames
    createOnLogin: isInFarcasterFrame() ? false : "users-without-wallets" as const,
  },
  // Don't show email login in frames
  loginMethods: isInFarcasterFrame() ? ["wallet"] as const : ["wallet", "email"] as const,
  walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "",
}; 