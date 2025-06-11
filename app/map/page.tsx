'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Camera, Loader2 } from 'lucide-react';
import { usePrivy, useLogin, useConnectWallet } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';
import { frameSdk } from '@/lib/frame-sdk';
import dynamic from 'next/dynamic';

// Dynamically import QRMap to avoid SSR issues with Leaflet
const QRMap = dynamic(() => import('@/components/QRMap'), { 
  ssr: false,
  loading: () => (
    <div className="bg-muted rounded-lg p-8 mb-8 min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    </div>
  )
});

interface QRMapEntry {
  id: number;
  image_url: string;
  latitude: number;
  longitude: number;
  uploader_id: string;
  uploader_type: string;
  city: string | null;
  fid: number | null;
  twitter_username: string | null;
  wallet_address: string | null;
  created_at: string;
}

interface UploaderInfo {
  id: string;
  type: 'farcaster' | 'twitter';
  fid?: number;
  twitterUsername?: string;
  walletAddress?: string;
}

interface FrameUser {
  fid?: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

// Define type for Privy linked accounts
interface PrivyLinkedAccount {
  type: string;
  address: string;
  chain?: string;
  // Other properties might exist but we don't need to specify them
}

export default function MapPage() {
  const [entries, setEntries] = useState<QRMapEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, authenticated } = usePrivy();
  const { address: walletAddress } = useAccount();
  
  // Auth flow state
  const [isConnecting, setIsConnecting] = useState(false);
  const [authStep, setAuthStep] = useState<'idle' | 'signin' | 'wallet' | 'ready'>('idle');
  const [userTriggeredLogin, setUserTriggeredLogin] = useState(false);
  
  // Frame detection state (same pattern as CustomWallet.tsx)
  const [frameUser, setFrameUser] = useState<FrameUser | null>(null);

  // Get Twitter/X username from user's linked accounts (same as CustomWallet.tsx)
  const twitterUsername = useMemo(() => {
    if (user?.linkedAccounts) {
      const twitterAccount = user.linkedAccounts.find((account: PrivyLinkedAccount) => account.type === 'twitter_oauth');
      // Return the twitter username if available
      return (twitterAccount as { username?: string })?.username || null;
    }
    return null;
  }, [user?.linkedAccounts]);

  // Auth hooks with proper error handling
  const { login } = useLogin({
    onComplete: () => {
      setIsConnecting(false);
      // Only proceed if this was a user-triggered login, not a page reload
      if (userTriggeredLogin) {
        setUserTriggeredLogin(false); // Reset flag
        toast.success('Twitter connected! Please connect your wallet to continue.');
        // Don't auto-connect wallet - let user manually trigger it
      }
      // If userTriggeredLogin is false, this is a page reload - do nothing
    },
    onError: (error: Error) => {
      console.error('Login error:', error);
      setIsConnecting(false);
      setAuthStep('idle');
      setUserTriggeredLogin(false); // Reset flag on error
      toast.error('Failed to sign in with Twitter. Please try again.');
    }
  });

  const { connectWallet } = useConnectWallet({
    onSuccess: () => {
      setIsConnecting(false);
      setAuthStep('ready');
      toast.success('Wallet connected! Click "Add Photo to Map" to upload.');
    },
    onError: (error: Error) => {
      console.error('Wallet connection error:', error);
      toast.error('Failed to connect wallet. Please try again.');
      setIsConnecting(false);
      // Don't reset to idle, let useEffect determine correct state
    }
  });

  // Check auth state and set appropriate step
  useEffect(() => {
    if (frameUser) {
      setAuthStep('ready'); // Frame users are always ready
    } else if (authenticated && twitterUsername && walletAddress) {
      setAuthStep('ready'); // Fully authenticated with wallet
    } else if (authenticated && twitterUsername && !walletAddress && !isConnecting) {
      setAuthStep('wallet'); // Need wallet connection (but not if already connecting)
    } else if (authenticated && !twitterUsername) {
      setAuthStep('signin'); // Need Twitter sign-in (shouldn't happen but safety)
    } else {
      setAuthStep('idle'); // Need full authentication
    }
  }, [frameUser, authenticated, twitterUsername, walletAddress, isConnecting]);

  const getCurrentLocation = useCallback((): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setLocation(coords);
            resolve(coords);
          },
          (error) => {
            console.error('Error getting location:', error);
            reject(error);
          }
        );
      } else {
        reject(new Error('Geolocation is not supported by this browser.'));
      }
    });
  }, []);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/qrmap');
      if (response.ok) {
        const result = await response.json();
        setEntries(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching entries:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Check if we're in a Farcaster frame on component mount (same pattern as CustomWallet.tsx)
  useEffect(() => {
    const checkFrameContext = async () => {
      try {
        const context = await frameSdk.getContext();
        if (context && context.user) {
          console.log("Running in Farcaster frame context", context);
          
          // Store frame user data with correct typing
          setFrameUser({
            fid: context.user.fid,
            displayName: context.user.displayName || undefined,
            username: context.user.username || undefined,
            pfpUrl: context.user.pfpUrl || undefined
          });
        } else {
          setFrameUser(null);
        }
      } catch (error) {
        console.log("Not in a Farcaster frame context:", error);
        setFrameUser(null);
      }
    };

    checkFrameContext();
  }, []);

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      // Using a free geocoding service - you might want to use a different one
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      );
      const data = await response.json();
      return data.city || data.locality || data.principalSubdivision || 'Unknown location';
    } catch (error) {
      console.error('Geocoding error:', error);
      return 'Unknown location';
    }
  };

  // Enhanced uploader identification: capture all relevant data
  const getUploaderInfo = useCallback(async (): Promise<UploaderInfo | null> => {
    // Frame context: Farcaster Frame user
    if (frameUser) {
      return {
        id: frameUser.username || frameUser.displayName || `fid:${frameUser.fid}`,
        type: 'farcaster',
        fid: frameUser.fid,
        walletAddress: walletAddress, // Capture wallet address even in frame
      };
    }

    // Website context: Twitter authentication (required first)
    if (twitterUsername) {
      return {
        id: `@${twitterUsername}`,
        type: 'twitter',
        twitterUsername,
        walletAddress: walletAddress, // Capture wallet address
      };
    }

    return null;
  }, [frameUser, twitterUsername, walletAddress]);

  const handleButtonClick = async () => {
    // Request location permission first
    let currentLocation = location;
    if (!currentLocation) {
      try {
        const locationToast = toast.loading('Detecting your location...');
        currentLocation = await getCurrentLocation();
        toast.dismiss(locationToast);
      } catch (error) {
        console.error('Location error:', error);
        toast.error('Location access is required to upload photos to the map.');
        return;
      }
    }

    // Implement auth flow similar to LinkVisitClaimPopup - trigger auth on click
    if (!frameUser) {
        
      // Website context - check auth state and trigger auth flow
      if (!authenticated) {
        // Not signed in at all - start sign in flow
        toast.info('Sign in with Twitter to upload images');
        setIsConnecting(true);
        setAuthStep('signin');
        setUserTriggeredLogin(true); // Mark as user-initiated login
        login();
        return;
      }
      
      // Check if user has Twitter/social auth but no wallet (similar to LinkVisitProvider)
      const hasTwitterOrSocialAuth = user?.linkedAccounts?.some((account: PrivyLinkedAccount) => 
        account.type === 'twitter_oauth' || account.type === 'farcaster'
      );
      
      if (!hasTwitterOrSocialAuth) {
        // Edge case: authenticated but no social auth (shouldn't happen)
        toast.error('Twitter authentication required');
        setIsConnecting(true);
        setAuthStep('signin');
        setUserTriggeredLogin(true); // Mark as user-initiated login
        login();
        return;
      }
      
      if (!walletAddress) {
        // Has social auth but no wallet - wallet connection should have been triggered automatically
        // If we reach here, it means auto-connection failed or was cancelled
        toast.info('Please connect your wallet to continue');
        setIsConnecting(true);
        setAuthStep('wallet');
        connectWallet();
        return;
      }
    }

    // All auth checks passed - open file picker
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // At this point, we know location and auth are good (checked in handleButtonClick)
    const uploaderInfo = await getUploaderInfo();
    if (!uploaderInfo) {
      toast.error('Authentication required. Please try again.');
      return;
    }

    setIsUploading(true);
    try {
      // Get city name from coordinates
      const city = await reverseGeocode(location!.lat, location!.lng);

      // Create form data
      const formData = new FormData();
      formData.append('image', file);
      formData.append('latitude', location!.lat.toString());
      formData.append('longitude', location!.lng.toString());
      formData.append('uploader_id', uploaderInfo.id);
      formData.append('uploader_type', uploaderInfo.type);
      formData.append('city', city);
      if (uploaderInfo.fid) {
        formData.append('fid', uploaderInfo.fid.toString());
      }
      if (uploaderInfo.twitterUsername) {
        formData.append('twitter_username', uploaderInfo.twitterUsername);
      }
      if (uploaderInfo.walletAddress) {
        formData.append('wallet_address', uploaderInfo.walletAddress);
      }

      // Upload to API
      const response = await fetch('/api/qrmap', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Image uploaded successfully!');
        
        // Add new entry to the beginning of the list
        setEntries(prev => [result.data, ...prev]);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  // Updated user identifier logic: Frame = Farcaster, Website = Twitter
  const userIdentifier = frameUser
    ? frameUser.username || `fid:${frameUser.fid}` // Frame context: show Farcaster username
    : twitterUsername 
    ? `@${twitterUsername}` // Website context: show Twitter username only
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full md:max-w-3xl mx-auto px-4 md:px-0 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">QR Map</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Share your QR code experiences from around the world. Snap a photo and pin it to the map!
          </p>
          {frameUser && (
            <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg max-w-md mx-auto">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                🎭 Connected as Farcaster user: {frameUser.username || frameUser.displayName}
              </p>
            </div>
          )}
        </div>

        {/* Interactive Map */}
        <QRMap entries={entries} onRefresh={fetchEntries} />

        {/* Upload Section */}
        <div className="max-w-md mx-auto text-center mb-8">
          {userIdentifier && (
            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                📸 Ready to upload as: {userIdentifier}
              </p>
            </div>
          )}

          <div className="space-y-4">
            {!frameUser && authStep !== 'ready' && (
              <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                  {authStep === 'idle' && '🐦 Sign in with Twitter and connect your wallet to upload photos'}
                  {authStep === 'signin' && '🔄 Connecting to Twitter...'}
                  {authStep === 'wallet' && '👛 Connect your wallet to continue...'}
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            <Button
              onClick={handleButtonClick}
              disabled={isUploading || isConnecting}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {authStep === 'signin' ? 'Signing in with Twitter...' : 
                   authStep === 'wallet' ? 'Connecting wallet...' : 'Connecting...'}
                </>
              ) : authStep === 'idle' ? (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Sign in to Add Photo
                </>
              ) : authStep === 'wallet' ? (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Connect Wallet to Continue
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photo to Map
                </>
              )}
            </Button>

            {location && (
              <div className="mt-4 p-4 bg-muted rounded-lg text-sm">
                <div className="font-medium mb-1">📍 Current Location:</div>
                <div className="text-muted-foreground">
                  Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Entries List */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Recent QR Map Entries</h2>
            {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
          </div>
          
          {entries.length === 0 && !isLoading ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No entries yet. Be the first to add a photo!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entries.map((entry) => (
                <div key={entry.id} className="bg-card rounded-lg p-4 border hover:shadow-lg transition-shadow">
                  <img
                    src={entry.image_url}
                    alt="QR Map Entry"
                    className="w-full h-48 object-cover rounded-lg mb-4"
                  />
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
                      <span className="truncate">
                        {entry.city || `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`}
                      </span>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <span className="mr-1">
                        {entry.uploader_type === 'farcaster' ? '🎭' : '𝕏'}
                      </span>
                      <span className="truncate">
                        {entry.uploader_type === 'farcaster' 
                          ? entry.uploader_id // Farcaster username is stored in uploader_id
                          : entry.twitter_username 
                          ? `@${entry.twitter_username}` // Twitter username from dedicated field
                          : entry.uploader_id // Fallback to uploader_id if no twitter_username
                        }
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 