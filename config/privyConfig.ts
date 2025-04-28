// config/privyConfig.ts
import { baseSepolia, base } from "wagmi/chains";

// Check if testnets are enabled
const useTestnets = (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "true";

// App chains configuration
const chains = useTestnets ? [baseSepolia] : [base];

// Make this function safe for server-side execution
const isInFarcasterFrame = () => {
  // Check if window is defined (runs only in browser)
  if (typeof window === 'undefined') {
    return false; // Assume not in a frame on the server
  }

  // Now it's safe to access window properties
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('fc') || searchParams.has('farcaster')) {
      return true;
    }

    const userAgent = window.navigator.userAgent || '';
    if (userAgent.toLowerCase().includes('warpcast')) {
      return true;
    }
  } catch (e) {
    // Catch potential errors during access (e.g., security restrictions)
    console.error("Error checking frame context:", e);
    return false;
  }

  return false;
};

// Export this function so it can be used in other components if needed
export { isInFarcasterFrame };

// Define the config structure, but determine frame-specific parts later
const basePrivyConfig = {
  appearance: {
    showWalletLoginFirst: true,
    accentColor: "hsl(var(--primary))", // Primary color from CSS
    logo: `https://qrcoin.fun/qrLogo.png`,
  },
  supportedChains: chains,
  defaultChain: useTestnets ? baseSepolia : base,
  walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "",
};

// Export a function to get the final config, allowing browser checks at runtime
export const getPrivyConfig = () => {
  const isFrame = isInFarcasterFrame();
  return {
    ...basePrivyConfig,
    appearance: {
      ...basePrivyConfig.appearance,
       walletList: isFrame
        ? ['detected_ethereum_wallets']
        : ['coinbase_wallet', 'rainbow', 'metamask', 'wallet_connect'],
    },
    embeddedWallets: {
      createOnLogin: isFrame ? false : "users-without-wallets" as const,
    },
    loginMethods: isFrame ? ["wallet"] as const : ["wallet", "email"] as const,
  };
};