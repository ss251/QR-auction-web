import { NextRequest, NextResponse } from 'next/server';
import { getClaimAmountForAddress } from '@/lib/wallet-balance-checker';
import { getClientIP } from '@/lib/ip-utils';
import { isRateLimited } from '@/lib/simple-rate-limit';

// Get Alchemy API key from environment
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';

export async function POST(request: NextRequest) {
  // Get client IP for rate limiting
  const clientIP = getClientIP(request);
  
  // Rate limit: 10 requests per minute
  if (isRateLimited(clientIP, 10, 60000)) {
    return NextResponse.json({ success: false, error: 'Rate Limited' }, { status: 429 });
  }
  
  try {
    const { address, claimSource } = await request.json();
    
    // Validate required parameters
    if (!address) {
      return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
    }
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: 'Invalid address format' }, { status: 400 });
    }
    
    // Get the claim amount based on wallet holdings
    const amount = await getClaimAmountForAddress(
      address,
      claimSource || 'web',
      ALCHEMY_API_KEY
    );
    
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