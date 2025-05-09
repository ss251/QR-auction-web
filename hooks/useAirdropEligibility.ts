import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { frameSdk } from '@/lib/frame-sdk';
import type { Context } from '@farcaster/frame-sdk';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// For testing purposes
const TEST_USERNAME = "thescoho.eth";

export function useAirdropEligibility() {
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [frameContext, setFrameContext] = useState<Context.FrameContext | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Log state changes
  useEffect(() => {
    console.log("ELIGIBILITY HOOK - State changed:");
    console.log("isEligible:", isEligible);
    console.log("isLoading:", isLoading);
    console.log("hasClaimed:", hasClaimed);
    console.log("walletAddress:", walletAddress);
    console.log("frameContext username:", frameContext?.user?.username);
    console.log("hasAddedFrame:", frameContext?.client?.added);
    console.log("hasNotifications:", !!frameContext?.client?.notificationDetails);
  }, [isEligible, isLoading, hasClaimed, walletAddress, frameContext]);
  
  // Get frame context and wallet
  useEffect(() => {
    const getFrameContext = async () => {
      try {
        // Get frame context
        const context = await frameSdk.getContext();
        console.log("FRAME CONTEXT OBTAINED:", context);
        console.log("Username:", context.user?.username);
        console.log("Frame added:", context.client?.added);
        console.log("Notifications:", !!context.client?.notificationDetails);
        setFrameContext(context);
        
        // Check if wallet is connected (no need to connect - FarcasterLogin does this)
        const isWalletConnected = await frameSdk.isWalletConnected();
        if (isWalletConnected) {
          const accounts = await frameSdk.connectWallet();
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
          }
        }
      } catch (error) {
        console.error('Error getting frame context:', error);
      }
    };
    
    getFrameContext();
  }, []);

  // Check eligibility based on frame context
  useEffect(() => {
    const checkEligibility = async () => {
      console.log("CHECKING ELIGIBILITY - Starting check");
      
      // If no frame context or wallet, not eligible
      if (!frameContext || !walletAddress) {
        console.log("Missing frame context or wallet address");
        setIsLoading(false);
        setIsEligible(false);
        return;
      }

      const fid = frameContext.user?.fid;
      const username = frameContext.user?.username;
      const isFrameAdded = frameContext.client?.added;
      const hasNotifications = !!frameContext.client?.notificationDetails;
      
      console.log("ELIGIBILITY CHECK:", {
        fid,
        username,
        isFrameAdded,
        hasNotifications,
        isTestUser: username === TEST_USERNAME
      });
      
      if (!fid) {
        console.log("No FID found");
        setIsLoading(false);
        setIsEligible(false);
        return;
      }
      
      setIsLoading(true);
      
      try {
        // First check if user has already claimed - do this check first
        console.log("Checking database for previous claims");
        const { data: claimData } = await supabase
          .from('airdrop_claims')
          .select('*')
          .eq('fid', fid)
          .single();
          
        if (claimData) {
          // User has already claimed
          console.log("User has already claimed - not eligible");
          setHasClaimed(true);
          setIsEligible(false);
          setIsLoading(false);
          return;
        }
        
        // For test user, check if they've claimed (in memory only)
        if (username === TEST_USERNAME) {
          console.log(`Test username ${TEST_USERNAME} detected - checking eligibility`);
          
          // Test users are eligible if they've added the frame and enabled notifications
          // We've already checked these conditions above
          setIsEligible(true);
          setIsLoading(false);
          return;
        }
        
        // Check if the frame has been added to the user's client
        if (!isFrameAdded) {
          console.log('User has not added the frame yet');
          setIsEligible(false);
          setIsLoading(false);
          return;
        }
        
        // Check if notifications are enabled
        if (!hasNotifications) {
          console.log('User has not enabled notifications');
          setIsEligible(false);
          setIsLoading(false);
          return;
        }
          
        // User is eligible (frame added and notifications enabled already checked above)
        console.log("User is eligible - regular path");
        setIsEligible(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Error checking airdrop eligibility:', error);
        setIsEligible(false);
        setIsLoading(false);
      }
    };

    checkEligibility();
  }, [frameContext, walletAddress]);
  
  // Function to record claim in database
  const recordClaim = async (txHash?: string): Promise<boolean> => {
    if (!frameContext?.user?.fid || !walletAddress) return false;
    
    // Skip database recording for test user
    if (frameContext.user.username === TEST_USERNAME) {
      console.log(`Test claim for ${TEST_USERNAME} - skipping database record`);
      // Update local state still
      setHasClaimed(true);
      setIsEligible(false);
      return true;
    }
    
    try {
      const { error } = await supabase
        .from('airdrop_claims')
        .insert({
          fid: frameContext.user.fid,
          eth_address: walletAddress,
          amount: 100000, // 100,000 QR tokens
          tx_hash: txHash,
          success: !!txHash
        });
        
      if (error) throw error;
      
      // Update local state
      setHasClaimed(true);
      setIsEligible(false);
      return true;
    } catch (error) {
      console.error('Error recording claim:', error);
      return false;
    }
  };
  
  return { 
    isEligible, 
    isLoading, 
    hasClaimed,
    recordClaim,
    frameContext,
    walletAddress,
    hasAddedFrame: frameContext?.client?.added || false,
    hasNotifications: !!frameContext?.client?.notificationDetails
  };
} 