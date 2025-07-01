'use client';

import { useState } from 'react';
import { useIsMiniApp } from '@/hooks/useIsMiniApp';
import { MiniKit } from '@worldcoin/minikit-js';
import { useWorldcoinAuth } from '@/hooks/useWorldcoinAuth';
import { useReadContracts, useAccount } from 'wagmi';
import { erc20Abi, Address } from 'viem';
import { Bug, X } from 'lucide-react';
import { useLinkVisit } from '@/providers/LinkVisitProvider';

const WLD_ADDRESS = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003" as Address;
const WORLD_CHAIN_ID = 480;

export function MiniAppDebug() {
  const [isOpen, setIsOpen] = useState(false);
  const { isLoading, miniAppType } = useIsMiniApp();
  const { user: worldUser, isAuthenticated: isWorldAuthenticated } = useWorldcoinAuth();
  const { address: eoaAddress } = useAccount();
  
  // Get LinkVisit context for debugging popup logic
  const linkVisitContext = useLinkVisit();
  
  // Get WLD balance for debugging
  const displayAddress = worldUser?.walletAddress || eoaAddress;
  const { data: wldBalance } = useReadContracts({
    contracts: [
      { 
        address: WLD_ADDRESS, 
        abi: erc20Abi, 
        functionName: "balanceOf", 
        args: [displayAddress as Address],
        chainId: WORLD_CHAIN_ID
      },
      { 
        address: WLD_ADDRESS, 
        abi: erc20Abi, 
        functionName: "decimals",
        chainId: WORLD_CHAIN_ID
      },
    ],
    query: {
      enabled: !!displayAddress && miniAppType === 'world',
    },
  });
  
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 bg-black/80 hover:bg-black/90 text-white p-2 rounded-full z-50 transition-colors"
        title={isOpen ? "Hide debug info" : "Show debug info"}
      >
        {isOpen ? <X className="h-4 w-4" /> : <Bug className="h-4 w-4" />}
      </button>
      
      {/* Debug overlay */}
      {isOpen && (
        <div className="fixed top-1/2 left-4 -translate-y-1/2 bg-black/90 text-white text-xs p-3 rounded-lg max-w-sm z-50 font-mono max-h-[80vh] overflow-y-auto">
          <div className="font-bold mb-2 text-yellow-400">Debug Info</div>
          
          {/* Mini App Info */}
          <div>MiniApp Loading: {isLoading ? 'Yes' : 'No'}</div>
          <div>MiniApp Type: {miniAppType || 'none'}</div>
          <div>MiniKit Installed: {MiniKit.isInstalled() ? 'Yes' : 'No'}</div>
          <div>World Auth: {isWorldAuthenticated ? 'Yes' : 'No'}</div>
          
          {/* Wallet Info */}
          {displayAddress && (
            <>
              <div className="mt-2 text-[10px] break-all">Wallet: {displayAddress}</div>
              {miniAppType === 'world' && wldBalance && (
                <>
                  <div className="mt-2 text-green-400">WLD Balance Data:</div>
                  <div className="text-[10px]">Raw: {wldBalance[0]?.result?.toString() || '0'}</div>
                  <div className="text-[10px]">Decimals: {wldBalance[1]?.result?.toString() || '18'}</div>
                  <div className="text-[10px]">Status: {wldBalance[0]?.status || 'unknown'}</div>
                </>
              )}
            </>
          )}
          
          {/* Popup Logic Debug */}
          <div className="mt-2 border-t border-gray-600 pt-2">
            <div className="text-yellow-400 font-bold">Popup Logic:</div>
            <div>Show Popup: {linkVisitContext.showClaimPopup ? 'Yes' : 'No'}</div>
            <div>Has Claimed: {linkVisitContext.hasClaimed ? 'Yes' : 'No'}</div>
            <div>Is Loading: {linkVisitContext.isLoading ? 'Yes' : 'No'}</div>
            <div>Latest Auction ID: {linkVisitContext.latestWonAuctionId || 'null'}</div>
            <div>Current Auction ID: {linkVisitContext.auctionId}</div>
            <div>Is Latest Won: {linkVisitContext.isLatestWonAuction ? 'Yes' : 'No'}</div>
            <div>Web Context: {linkVisitContext.isWebContext ? 'Yes' : 'No'}</div>
            <div>Wallet Status Determined: {linkVisitContext.walletStatusDetermined ? 'Yes' : 'No'}</div>
            <div>Auth Check Complete: {linkVisitContext.authCheckComplete ? 'Yes' : 'No'}</div>
            <div>Is Checking DB: {linkVisitContext.isCheckingDatabase ? 'Yes' : 'No'}</div>
            
            {/* LocalStorage State */}
            <div className="mt-1 text-blue-400">LocalStorage:</div>
            <div className="text-[10px]">Click State: {typeof window !== 'undefined' ? (localStorage.getItem('qrcoin_link_clicked') || 'null') : 'N/A'}</div>
            <div className="text-[10px]">Flow State: {typeof window !== 'undefined' ? (localStorage.getItem('qrcoin_claim_flow_state') || 'null') : 'N/A'}</div>
            
            {/* Test Force Popup */}
            <div className="mt-2 border-t border-gray-500 pt-2">
              <div className="flex gap-1 flex-wrap">
                <button 
                  onClick={() => {
                    console.log('🔥 FORCE POPUP TEST');
                    // Try to trigger popup manually
                    const event = new CustomEvent('triggerLinkVisitPopup');
                    window.dispatchEvent(event);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[10px]"
                >
                  Force Popup
                </button>
                <button 
                  onClick={() => {
                    console.log('🧹 CLEAR LOCALSTORAGE');
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('qrcoin_link_clicked');
                      localStorage.removeItem('qrcoin_claim_flow_state');
                    }
                  }}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 rounded text-[10px]"
                >
                  Clear Storage
                </button>
                <button 
                  onClick={() => {
                    console.log('✅ SET CLICKED STATE');
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('qrcoin_link_clicked', 'true');
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-[10px]"
                >
                  Set Clicked
                </button>
              </div>
            </div>
          </div>
          
          {/* Environment Debug */}
          <div className="mt-2 border-t border-gray-600 pt-2">
            <div className="text-yellow-400 font-bold">Environment:</div>
            <div className="text-[10px]">Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Missing'}</div>
            <div className="text-[10px]">Supabase Anon Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing'}</div>
          </div>
          
          <div className="mt-2 text-[10px] break-all">URL: {typeof window !== 'undefined' ? window.location.href : 'N/A'}</div>
        </div>
      )}
    </>
  );
}