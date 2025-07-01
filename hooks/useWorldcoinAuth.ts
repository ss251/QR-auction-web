import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useLoginWithSiwe } from '@privy-io/react-auth';
import { MiniKit } from '@worldcoin/minikit-js';

interface LinkedAccount {
  type: string;
  address?: string;
  [key: string]: unknown;
}

interface PrivyUser {
  id: string;
  wallet?: {
    address: string;
  };
  linkedAccounts?: LinkedAccount[];
  [key: string]: unknown;
}

interface WorldUser {
  walletAddress: string;
  worldId?: string;
  username?: string;
  profilePictureUrl?: string;
  linkedAccounts?: LinkedAccount[];
  isVerifiedHuman?: boolean;
}

export function useWorldcoinAuth() {
  const [worldUser, setWorldUser] = useState<WorldUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authenticated, user } = usePrivy();
  
  // Use Privy's SIWE login for World App integration
  const { generateSiweNonce, loginWithSiwe } = useLoginWithSiwe({
    onSuccess: async (privyUser: PrivyUser) => {
      setIsAuthenticating(false);
      
      // For World App, we need to get the wallet address from linked accounts
      const walletAccount = privyUser.linkedAccounts?.find(
        (account: LinkedAccount) => account.type === 'wallet'
      );
      
      if (walletAccount?.address) {
        // Get username and profile picture from MiniKit
        const username = MiniKit.user?.username;
        const profilePictureUrl = MiniKit.user?.profilePictureUrl;
        
        setWorldUser({
          walletAddress: walletAccount.address,
          worldId: privyUser.id,
          username: username,
          profilePictureUrl: profilePictureUrl,
          linkedAccounts: privyUser.linkedAccounts,
          isVerifiedHuman: true // If they can authenticate, they're verified
        });
      }
    },
    onError: (error: unknown) => {
      setError((error as Error)?.message || 'Authentication failed');
      setIsAuthenticating(false);
    }
  });

  // Check if already authenticated with World App wallet on mount
  useEffect(() => {
    const privyUser = user as unknown as PrivyUser | null;
    if (authenticated && privyUser && privyUser.wallet?.address && MiniKit.isInstalled()) {
      // This is a World App user
      const username = MiniKit.user?.username;
      const profilePictureUrl = MiniKit.user?.profilePictureUrl;
      
      setWorldUser({
        walletAddress: privyUser.wallet.address,
        worldId: privyUser.id,
        username: username,
        profilePictureUrl: profilePictureUrl,
        linkedAccounts: privyUser.linkedAccounts,
        isVerifiedHuman: true // If they can authenticate, they're verified
      });
    }
  }, [authenticated, user]);

  const authenticateWithWorldcoin = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setError('World App not detected');
      return null;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // Generate nonce from Privy
      const nonce = await generateSiweNonce();
      
      // Authenticate via World App wallet
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce
      });
      
      if (!finalPayload) {
        throw new Error('No payload returned from wallet auth');
      }
      
      // Login with SIWE using the signed message  
      if ('message' in finalPayload && 'signature' in finalPayload) {
        await loginWithSiwe({
          message: finalPayload.message,
          signature: finalPayload.signature
        });
      } else {
        throw new Error('Invalid authentication response');
      }
      
      // The onSuccess callback will handle setting worldUser
      // Return true to indicate successful authentication
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
      setIsAuthenticating(false);
      return null;
    }
  }, [generateSiweNonce, loginWithSiwe]);

  const verifyHumanity = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setError('World App not detected');
      return false;
    }

    try {
      // Use World ID verification with action from Developer Portal
      const verifyPayload = {
        action: 'verify-humanity', // This would need to be created in World Developer Portal
        verification_level: 'orb' // Require orb verification for strongest proof
      };

      const { finalPayload } = await MiniKit.commandsAsync.verify(verifyPayload as Parameters<typeof MiniKit.commandsAsync.verify>[0]);
      
      if (finalPayload && 'verification_level' in finalPayload && finalPayload.verification_level === 'orb') {
        // Update user with verified status
        if (worldUser) {
          setWorldUser({
            ...worldUser,
            isVerifiedHuman: true
          });
        }
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Humanity verification failed:', error);
      setError('Humanity verification failed');
      return false;
    }
  }, [worldUser]);

  const logout = useCallback(() => {
    setWorldUser(null);
    setError(null);
  }, []);

  return {
    user: worldUser,
    isAuthenticating,
    error,
    authenticateWithWorldcoin,
    verifyHumanity,
    logout,
    isAuthenticated: !!worldUser
  };
}