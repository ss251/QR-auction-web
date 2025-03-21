// Type definitions and utilities for Farcaster integration

type FarcasterUser = {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  isVerified: boolean;
};

// Cache Farcaster usernames to reduce API calls
const farcasterCache = new Map<string, FarcasterUser | null>();

/**
 * Fetches Farcaster username for an Ethereum address
 * @param address The Ethereum address to look up
 * @returns Farcaster user info or null if not found
 */
export async function getFarcasterUser(address: string): Promise<FarcasterUser | null> {
  // Make sure we're using a valid Ethereum address (0x...) and not a name
  if (!address.startsWith('0x') || address.length !== 42) {
    console.error('Invalid Ethereum address format for Farcaster lookup:', address);
    return null;
  }
  
  // Normalize address
  const normalizedAddress = address.toLowerCase();
  
  // Check cache first
  if (farcasterCache.has(normalizedAddress)) {
    return farcasterCache.get(normalizedAddress) || null;
  }
  
  try {
    // Format address for API
    const formattedAddress = normalizedAddress;
    
    // Fetch from Neynar API
    const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
    if (!apiKey) {
      console.error("Missing Neynar API key");
      return null;
    }
    
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${formattedAddress}&address_types=verified_address`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-api-key': apiKey
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Neynar API response:", data);
    
    // Process API response - the response structure is different than expected
    // It returns an object with address as key and array of users as value
    if (data && data[normalizedAddress] && data[normalizedAddress].length > 0) {
      const user = data[normalizedAddress][0];
      const farcasterUser: FarcasterUser = {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        isVerified: true
      };
      
      // Cache the result
      farcasterCache.set(normalizedAddress, farcasterUser);
      
      return farcasterUser;
    }
    
    // If no user found, cache null to avoid repeated lookups
    farcasterCache.set(normalizedAddress, null);
    return null;
  } catch (error) {
    console.error('Error fetching Farcaster username:', error);
    return null;
  }
}