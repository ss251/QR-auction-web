// config/privyConfig.ts
import { baseSepolia, base } from "wagmi/chains";
import { addRpcUrlOverrideToChain } from "@privy-io/chains";


// Check if testnets are enabled
const useTestnets = (process.env.NEXT_PUBLIC_ENABLE_TESTNETS as string) === "true";

const mainnetOverride = addRpcUrlOverrideToChain(base, `https://base-mainnet.g.alchemy.com/v2/zRmt5RAPz_-zQRJYVgXx-FtqhUcYNkGn`);

// App chains configuration
const chains = useTestnets ? [baseSepolia] : [mainnetOverride];

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

// Detect if we're in an iframe embedded in warpcast.com
const isInWarpcastIframe = () => {
  // Server-side safety check
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    // Check if we're in an iframe
    if (window !== window.parent) {
      // Try to get the parent URL - this might throw a cross-origin error
      // If it does, we can't determine the parent URL directly
      try {
        const parentUrl = window.parent.location.href;
        return parentUrl.startsWith('https://warpcast.com/');
      } catch {
        // If we get a cross-origin error, check the referrer
        const referrer = document.referrer;
        return referrer.startsWith('https://warpcast.com/');
      }
    }
  } catch (e) {
    console.error("Error checking warpcast iframe:", e);
  }

  return false;
};

// Safely detect if user is on a mobile browser
const isMobileBrowser = () => {
  // Server-side safety check
  if (typeof window === 'undefined') {
    return false;
  }

  // User agent detection
  const userAgent = window.navigator.userAgent || '';
  const userAgentCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  // Screen size check
  const screenWidthCheck = window.innerWidth < 768;
  
  // Touch capability check
  const touchCheck = 'ontouchstart' in window || 
                    (navigator.maxTouchPoints > 0);
  
  // Use multiple signals for more reliable detection
  return userAgentCheck || (screenWidthCheck && touchCheck);
};

// Export these functions so they can be used in other components if needed
export { isInFarcasterFrame, isMobileBrowser, isInWarpcastIframe };

// Define the config structure, but determine frame-specific parts later
const basePrivyConfig = {
  appearance: {
    showWalletLoginFirst: true,
    accentColor: "hsl(var(--primary))", // Primary color from CSS
    logo: `https://qrcoin.fun/qrLogo.png`,
  },
  supportedChains: chains,
  defaultChain: useTestnets ? baseSepolia : mainnetOverride,
  walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || "",
};

// Export a function to get the final config, allowing browser checks at runtime
export const getPrivyConfig = () => {
  const isFrame = isInFarcasterFrame();
  const isMobile = isMobileBrowser();
  const isWarpcastIframe = isInWarpcastIframe();
  
  // Wallet list configuration based on device and frame context
  let walletList;
  if (isFrame) {
    walletList = ['detected_ethereum_wallets'];
  } else if (isMobile) {
    walletList = ['coinbase_wallet', 'rainbow', 'metamask', 'wallet_connect'];
  } else if (isWarpcastIframe) {
    walletList = ['detected_ethereum_wallets'];
  } else {
    walletList = ['coinbase_wallet', 'rainbow', 'metamask', 'wallet_connect', 'detected_ethereum_wallets'];
  }

  // Determine login methods - no email for Farcaster frames or Warpcast iframes
  const loginMethods = (isFrame || isWarpcastIframe) ? ["wallet"] as const : ["wallet", "email"] as const;

  return {
    ...basePrivyConfig,
    appearance: {
      ...basePrivyConfig.appearance,
      walletList,
    },
    embeddedWallets: {
      createOnLogin: isFrame ? false : "users-without-wallets" as const,
    },
    loginMethods,
  };
};