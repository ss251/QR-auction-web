import { NextRequest, NextResponse } from 'next/server';
import { getClaimAmountForAddress } from '@/lib/wallet-balance-checker';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';

// Get Alchemy API key from environment
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';

// Simple in-memory deduplication cache
const pendingRequests = new Map<string, Promise<number>>();

export async function POST(request: NextRequest) {
  // Get client IP for rate limiting
  const clientIP = getClientIP(request);
  
  // Rate limit: 10 requests per minute
  if (isRateLimited(clientIP, 10, 60000)) {
    return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
  }
  
  try {
    const { address, claimSource, fid } = await request.json();
    
    // Validate required parameters
    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
    }
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: 'Invalid address format' }, { status: 400 });
    }
    
    // Create a cache key based on the request parameters
    const cacheKey = `${address}-${claimSource || 'web'}-${fid || 'none'}`;
    
    // Check if we already have a pending request for this exact combination
    if (pendingRequests.has(cacheKey)) {
      console.log(`🔄 Deduplicating request for ${cacheKey}`);
      const amount = await pendingRequests.get(cacheKey)!;
      return NextResponse.json({ 
        success: true, 
        amount,
        source: claimSource || 'web',
        deduplicated: true
      });
    }
    
    // Create a new promise for this request
    const amountPromise = getClaimAmountForAddress(
      address,
      claimSource || 'web',
      ALCHEMY_API_KEY,
      fid
    );
    
    // Store the promise in our cache
    pendingRequests.set(cacheKey, amountPromise);
    
    // Clean up the cache after the request completes
    amountPromise.finally(() => {
      // Remove from cache after a short delay to catch immediate duplicates
      setTimeout(() => {
        pendingRequests.delete(cacheKey);
      }, 100);
    });
    
    // Wait for the amount
    const amount = await amountPromise;
    
    return NextResponse.json({ 
      success: true, 
      amount,
      source: claimSource || 'web'
    });
    
  } catch (error) {
    console.error('Error checking claim amount:', error);
    
    // Return default amount on error
    const claimSource = 'web'; // Default to web if we can't determine
    const defaultAmount = ['web', 'mobile'].includes(claimSource) ? 500 : 1000;
    
    return NextResponse.json({ 
      success: true, 
      amount: defaultAmount,
      source: claimSource,
      defaulted: true // Indicate we're using default due to error
    });
  }
}