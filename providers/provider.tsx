"use client";

import type { ReactNode } from "react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { FarcasterFrameProvider } from "./FrameProvider";
import { SupabaseProvider } from "./SupabaseProvider";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";

// Import Privy-specific components
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";

// Import configurations
import { privyConfig } from "../config/privyConfig";
import { wagmiConfig } from "../config/wagmiConfig";

const queryClient = new QueryClient();

export function Provider(props: { children: ReactNode }) {
  // Get current theme
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // Need to wait for client-side hydration to get the actual theme
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Use the current theme or fallback to light if not mounted yet
  const currentTheme = mounted ? (resolvedTheme || theme) : 'light';
  
  // Apply theme-specific appearance options
  const themeAwareConfig = {
    ...privyConfig,
    theme: currentTheme === 'dark' ? 'dark' : 'light', // Set Privy theme based on app theme
    appearance: {
      ...privyConfig.appearance,
      ...(currentTheme === 'dark' ? {
        accentColor: "#FFFFFF",  // White accent for dark mode
        textColor: "#000000",    // Black text for controls in dark mode
      } : {}),
    }
  };

  return (
    <FarcasterFrameProvider>
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
        config={{
            ...themeAwareConfig,
            // Add recommended embedded wallet config for AA
            embeddedWallets: {
                createOnLogin: 'users-without-wallets', 
                // Ensure showWalletUIs is false if you don't want Privy modals
                // This might need configuration in the Privy Dashboard instead
                // showWalletUIs: false, 
            }
        }}
      >
        <SmartWalletsProvider
        >
          <QueryClientProvider client={queryClient}>
            <WagmiProvider config={wagmiConfig}>
              <SupabaseProvider>{props.children}</SupabaseProvider>
            </WagmiProvider>
          </QueryClientProvider>
        </SmartWalletsProvider>
      </PrivyProvider>
    </FarcasterFrameProvider>
  );
}
