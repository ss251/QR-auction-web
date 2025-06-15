/* eslint-disable */
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuctionMetrics } from "@/hooks/useAuctionMetrics";
import { TestimonialsAdmin } from "./testimonials";
import { EngagementManager } from "@/components/admin/EngagementManager";
import { PostAuctionChecklist } from "@/components/admin/PostAuctionChecklist";
import {
  LineChart,
  Line,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useRedirectCostPerClick } from "@/hooks/useRedirectCostPerClick";
import { WalletBalancesSection } from "@/components/admin/WalletBalancesSection";

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

// Subgraph Analytics Component
function SubgraphAnalytics() {
  const { data: metrics, isLoading } = useAuctionMetrics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array(12).fill(0).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                <Skeleton className="h-4 w-40" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <Skeleton className="h-8 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Error Loading Data</h3>
        <p className="text-red-700 dark:text-red-400">
          There was an error loading the subgraph analytics data. Please try again later.
        </p>
      </div>
    );
  }

  const formatNumber = (num: number | undefined, decimals = 2) => {
    if (num === undefined) return "0";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercentage = (num: number | undefined) => {
    if (num === undefined) return "0%";
    return `${formatNumber(num, 1)}%`;
  };

  const formatEthValue = (ethValue: number | undefined) => {
    if (ethValue === undefined) return "0 ETH";
    return `${formatNumber(ethValue, 4)} ETH`;
  };

  const formatQrValue = (qrValue: number | undefined) => {
    if (qrValue === undefined) return "0 $QR";
    return `${formatNumber(qrValue, 0)} $QR`;
  };

  const formatUsdValue = (value: number | undefined) => {
    if (value === undefined) return "$0.00";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div>
      <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-green-800 dark:text-green-300 mb-2">
          Subgraph Analytics
        </h3>
        <p className="text-green-700 dark:text-green-400">
          Real-time on-chain analytics powered by The Graph protocol. Last updated: {new Date(metrics.lastUpdatedTimestamp * 1000).toLocaleString()}
        </p>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Auctions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalAuctions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Bids</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalBids}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatPercentage(100 * metrics.totalETHBidCount / metrics.totalBids)} ETH | 
                {formatPercentage(100 * metrics.totalQRBidCount / metrics.totalBids)} QR
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Bid Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatUsdValue(metrics.totalBidValueUsd)}</div>
              <div className="text-xs text-gray-500 mt-1">
                ETH: {formatEthValue(metrics.totalETHBidVolume)} | QR: {formatQrValue(metrics.totalQRBidVolume)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Unique Bidders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalUniqueBidders}</div>
              <div className="text-xs text-gray-500 mt-1">
                ETH: {metrics.uniqueETHBidders} | QR: {metrics.uniqueQRBidders}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-xl font-semibold mb-4">ETH Auction Metrics</h3>
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">ETH Total Bids</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalETHBidCount}</div>
                <div className="text-xs text-gray-500 mt-1">
                  From {metrics.uniqueETHBidders} unique bidders
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">ETH Bid Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatEthValue(metrics.totalETHBidVolume)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatUsdValue(metrics.ethBidValueUsd)}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4">QR Auction Metrics</h3>
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">QR Total Bids</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalQRBidCount}</div>
                <div className="text-xs text-gray-500 mt-1">
                  From {metrics.uniqueQRBidders} unique bidders
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">QR Bid Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatQrValue(metrics.totalQRBidVolume)}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatUsdValue(metrics.qrBidValueUsd)}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Bidding Behavior</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Bids per Auction</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(metrics.bidsPerAuction, 1)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Auctions with Bidding Wars</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.biddingWarsCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatPercentage(metrics.biddingWarsPercentage)} of all auctions
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Bids in Final 5 Minutes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalFinalMinutesBids}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatPercentage(metrics.finalMinutesBidsPercentage)} of all bids
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Winning Bids</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <h4 className="text-lg font-medium mb-3">ETH Auctions</h4>
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">ETH Total Winning Bids Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatEthValue(metrics.totalETHWinningBidsValue)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatUsdValue(metrics.totalETHWinningBidsValue * metrics.ethPriceUsd)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">ETH Average Winning Bid</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatEthValue(metrics.averageETHWinningBidValue)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatUsdValue(metrics.averageETHWinningBidValue * metrics.ethPriceUsd)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-medium mb-3">QR Auctions</h4>
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">QR Total Winning Bids Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatQrValue(metrics.totalQRWinningBidsValue)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatUsdValue(metrics.totalQRWinningBidsValue * metrics.qrPriceUsd)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">QR Average Winning Bid</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatQrValue(metrics.averageQRWinningBidValue)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatUsdValue(metrics.averageQRWinningBidValue * metrics.qrPriceUsd)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for Redirect Click Analytics
function useRedirectClickAnalytics() {
  const { address } = useAccount();
  const [data, setData] = useState<{
    auctionData: {
      auction_id: number;
      date: string;
      total_clicks: number;
      unique_clicks: number;
      click_sources: {
        qr_arrow: number;
        winner_link: number;
        winner_image: number;
        popup_button: number;
        popup_image: number;
      };
    }[];
    stats?: {
      totalAuctions: number;
      auctionsWithClicks: number;
      totalClicks: number;
      totalUniqueClicks: number;
      minAuctionId: number;
      maxAuctionId: number;
      earliestAuctionIdWithClicks: number;
    };
    isLoading: boolean;
    error: Error | null;
  }>({
    auctionData: [],
    isLoading: true,
    error: null
  });
  
  useEffect(() => {
    if (!address) return;
    
    const fetchData = async () => {
      try {
        const response = await fetch('/api/redirect-click-analytics', {
          headers: {
            'Authorization': `Bearer ${address}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const resultData = await response.json();
        setData({
          auctionData: resultData.auctionData,
          stats: resultData.stats,
          isLoading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching redirect click analytics:', error);
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error : new Error('An unknown error occurred')
        }));
      }
    };

    fetchData();
  }, [address]);

  return data;
}

// Farcaster Notifications Component
function FarcasterNotifications() {
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState({
    title: '',
    body: '',
    target_url: '',
    uuid: ''
  });
  const [targeting, setTargeting] = useState({
    target_fids: '',
    exclude_fids: '',
    following_fid: '',
    minimum_user_score: 0.5,
  });
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate a new UUID for the notification
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // Fetch latest winner data
  const fetchLatestWinner = useCallback(async () => {
    try {
      const response = await fetch('/api/latest-winner', {
        headers: {
          'Authorization': `Bearer ${address}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const winnerName = data.twitterUsername || data.farcasterUsername || 'Winner';
        const auctionId = data.auctionId;
        
        // Create title with character limit consideration
        const baseTitle = `${winnerName} won auction #${auctionId}!`;
        const title = baseTitle.length > 32 ? `${winnerName} won #${auctionId}!` : baseTitle;
        
        setNotification(prev => ({
          ...prev,
          title: title,
          body: 'Click here to check out the winning link and claim 420 $QR',
          target_url: 'https://qrcoin.fun'
        }));
      }
    } catch (error) {
      console.error('Error fetching latest winner:', error);
      // Fallback to default values
      setNotification(prev => ({
        ...prev,
        title: 'New Winner Announced!',
        body: 'Click here to check out the winning link and claim 420 $QR',
        target_url: 'https://qrcoin.fun'
      }));
    }
  }, [address]);

  // Initialize with a UUID and fetch winner data
  useEffect(() => {
    setNotification(prev => ({
      ...prev,
      uuid: generateUUID()
    }));
    if (address) {
      fetchLatestWinner();
    }
  }, [address, fetchLatestWinner]);

  const handleSendNotification = async () => {
    if (!notification.title || !notification.body) {
      setError('Title and body are required');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResponse(null);

    try {
      // Parse target FIDs
      const targetFids = (targeting.target_fids || '')
        .split(',')
        .map(fid => parseInt(fid.trim()))
        .filter(fid => !isNaN(fid));

      const excludeFids = (targeting.exclude_fids || '')
        .split(',')
        .map(fid => parseInt(fid.trim()))
        .filter(fid => !isNaN(fid));

      // Build filters object conditionally
      const filters: any = {};
      if (excludeFids.length > 0) filters.exclude_fids = excludeFids;
      if (targeting.following_fid) filters.following_fid = parseInt(targeting.following_fid);
      if (targeting.minimum_user_score !== 0.5) filters.minimum_user_score = targeting.minimum_user_score;

      const payload = {
        target_fids: targetFids,
        ...(Object.keys(filters).length > 0 && { filters }),
        notification: {
          title: notification.title,
          body: notification.body,
          target_url: notification.target_url || undefined,
          uuid: notification.uuid
        }
      };

      // Debug: Log the payload being sent
      const response = await fetch('/api/farcaster/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${address}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send notification');
      }

      setResponse(data);
      
      // Generate new UUID for next notification
      setNotification(prev => ({
        ...prev,
        uuid: generateUUID()
      }));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <h3 className="text-lg font-medium text-purple-800 dark:text-purple-300 mb-2">
          Farcaster Mini App Notifications
        </h3>
        <p className="text-purple-700 dark:text-purple-400">
          Send push notifications to users who have interacted with the QRCoin mini app. Uses Neynar API.
        </p>
        <div className="text-xs text-purple-600 dark:text-purple-500 mt-2">
          Official Farcaster limits: Title max 32 chars, Body max 128 chars, Target URL max 1024 chars.
        </div>
      </div>

      {/* Notification Composer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Compose Notification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title *</label>
            <input
              type="text"
              value={notification.title}
              onChange={(e) => setNotification(prev => ({ ...prev, title: e.target.value }))}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              placeholder="Auction Update"
              maxLength={32}
            />
            <div className="text-xs text-gray-500 mt-1">{notification.title.length}/32 characters</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Body *</label>
            <textarea
              value={notification.body}
              onChange={(e) => setNotification(prev => ({ ...prev, body: e.target.value }))}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              placeholder="Check out the latest auction results!"
              rows={3}
              maxLength={128}
            />
            <div className="text-xs text-gray-500 mt-1">{notification.body.length}/128 characters</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Target URL (optional)</label>
            <input
              type="url"
              value={notification.target_url}
              onChange={(e) => setNotification(prev => ({ ...prev, target_url: e.target.value }))}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              placeholder="https://qrcoin.fun"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">UUID</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={notification.uuid}
                onChange={(e) => setNotification(prev => ({ ...prev, uuid: e.target.value }))}
                className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 font-mono text-sm"
              />
              <button
                onClick={() => setNotification(prev => ({ ...prev, uuid: generateUUID() }))}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Generate
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Targeting Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Targeting & Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Target FIDs (comma-separated)</label>
            <input
              type="text"
              value={targeting.target_fids}
              onChange={(e) => setTargeting(prev => ({ ...prev, target_fids: e.target.value }))}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              placeholder="1, 2, 3"
            />
            <div className="text-xs text-gray-500 mt-1">Leave empty to send to all mini app users</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Exclude FIDs (comma-separated)</label>
            <input
              type="text"
              value={targeting.exclude_fids}
              onChange={(e) => setTargeting(prev => ({ ...prev, exclude_fids: e.target.value }))}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              placeholder="1, 2, 3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Following FID</label>
            <input
              type="text"
              value={targeting.following_fid}
              onChange={(e) => setTargeting(prev => ({ ...prev, following_fid: e.target.value }))}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
              placeholder="3"
            />
            <div className="text-xs text-gray-500 mt-1">Only send to users following this FID</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Minimum User Score: {targeting.minimum_user_score}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={targeting.minimum_user_score}
              onChange={(e) => setTargeting(prev => ({ ...prev, minimum_user_score: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="text-xs text-gray-500 mt-1">Filter by user reputation score (0-1)</div>
          </div>
        </CardContent>
      </Card>

      {/* Send Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSendNotification}
          disabled={isLoading || !notification.title || !notification.body}
          className="px-8 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isLoading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          )}
          <span>{isLoading ? 'Sending...' : 'Send Notification'}</span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h4 className="text-red-800 dark:text-red-300 font-medium">Error</h4>
          <p className="text-red-700 dark:text-red-400 mt-1">{error}</p>
        </div>
      )}

      {/* Response Display */}
      {response && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-green-600">Notification Sent Successfully</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <h4 className="font-medium mb-2">Delivery Status:</h4>
                {response.notification_deliveries?.length > 0 ? (
                  <div className="space-y-2">
                    {response.notification_deliveries.map((delivery: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span>FID: {delivery.fid}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          delivery.status === 'success' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}>
                          {delivery.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No delivery information available</p>
                )}
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Raw Response:</h4>
                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Clicks Analytics Component - focuses on redirect click data
function ClicksAnalytics() {
  const redirectData = useRedirectClickAnalytics();
  const costPerClickData = useRedirectCostPerClick();
  const [showOnlyWithClicks, setShowOnlyWithClicks] = useState(false);
  const [auctionRange, setAuctionRange] = useState<[number, number] | null>(null);
  
  // Set initial range when redirect data loads
  useEffect(() => {
    if (redirectData.stats && !auctionRange) {
      const minId = redirectData.stats.earliestAuctionIdWithClicks || redirectData.stats.minAuctionId;
      const maxId = redirectData.stats.maxAuctionId;
      setAuctionRange([minId, maxId]);
    }
  }, [redirectData.stats, auctionRange]);

  // Apply filters to the redirect click data
  const filteredRedirectData = useMemo(() => {
    if (!redirectData.auctionData || !auctionRange) return [];
    
    return redirectData.auctionData
      .filter(item => {
        const inRange = item.auction_id >= auctionRange[0] && item.auction_id <= auctionRange[1];
        const hasClicks = showOnlyWithClicks ? item.total_clicks > 0 : true;
        return inRange && hasClicks;
      })
      .sort((a, b) => a.auction_id - b.auction_id);
  }, [redirectData.auctionData, auctionRange, showOnlyWithClicks]);

  // Apply filters to the cost per click data
  const filteredCostData = useMemo(() => {
    if (!costPerClickData.auctionData || !auctionRange) return [];
    
    return costPerClickData.auctionData
      .filter(item => {
        const inRange = item.auction_id >= auctionRange[0] && item.auction_id <= auctionRange[1];
        const hasClicks = showOnlyWithClicks ? item.click_count > 0 : true;
        return inRange && hasClicks;
      })
      .sort((a, b) => a.auction_id - b.auction_id);
  }, [costPerClickData.auctionData, auctionRange, showOnlyWithClicks]);

  if (redirectData.isLoading || costPerClickData.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  <Skeleton className="h-4 w-40" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (redirectData.error || costPerClickData.error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Error Loading Data</h3>
        <p className="text-red-700 dark:text-red-400">
          There was an error loading the clicks data. Please try again later.
        </p>
      </div>
    );
  }

  if (redirectData.auctionData.length === 0) {
    return (
      <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-amber-800 dark:text-amber-300 mb-2">No Data Available</h3>
        <p className="text-amber-700 dark:text-amber-400">
          Clicks data is not available yet. This feature tracks clicks from various sources.
        </p>
      </div>
    );
  }

  if (!auctionRange) {
    return (
      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">Preparing Data</h3>
        <p className="text-blue-700 dark:text-blue-400">
          Loading clicks data and calculating metrics...
        </p>
      </div>
    );
  }

  // Calculate stats for the filtered data
  const filteredClicks = filteredRedirectData.reduce((sum, item) => sum + item.total_clicks, 0);
  const filteredUniqueClicks = filteredRedirectData.reduce((sum, item) => sum + item.unique_clicks, 0);
  const auctionsWithClicks = filteredRedirectData.filter(item => item.total_clicks > 0);
  const clickedAuctionsCount = auctionsWithClicks.length;

  // Format currency for tooltips
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div>
      <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-green-800 dark:text-green-300 mb-2">Clicks Analysis</h3>
        <p className="text-green-700 dark:text-green-400">
          Analyze click patterns and sources. Starting from auction #{redirectData.stats?.earliestAuctionIdWithClicks}.
        </p>
        <div className="text-xs text-green-600 dark:text-green-500 mt-2">
          Note: This tracks clicks through our redirect system from different sources.
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-green-800 dark:text-green-300 mb-2">
              Auction ID Range: {auctionRange[0]} - {auctionRange[1]}
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min={redirectData.stats?.minAuctionId || 0}
                max={redirectData.stats?.maxAuctionId || 100}
                value={auctionRange[0]}
                onChange={(e) => setAuctionRange([parseInt(e.target.value), auctionRange[1]])}
                className="flex-1"
              />
              <input
                type="range"
                min={redirectData.stats?.minAuctionId || 0}
                max={redirectData.stats?.maxAuctionId || 100}
                value={auctionRange[1]}
                onChange={(e) => setAuctionRange([auctionRange[0], parseInt(e.target.value)])}
                className="flex-1"
              />
            </div>
          </div>
          <div className="flex items-center">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyWithClicks}
                onChange={() => setShowOnlyWithClicks(!showOnlyWithClicks)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
              <span className="ms-3 text-sm font-medium text-green-800 dark:text-green-300">
                Show only auctions with clicks
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auctions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredRedirectData.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {clickedAuctionsCount} with clicks ({Math.round(clickedAuctionsCount / Math.max(filteredRedirectData.length, 1) * 100) || 0}%)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredClicks.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">
              Avg {(filteredClicks / Math.max(clickedAuctionsCount, 1)).toFixed(1)} per auction with clicks
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Uniques</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredUniqueClicks.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">
              {Math.round((filteredUniqueClicks / Math.max(filteredClicks, 1)) * 100)}% of total clicks
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unique vs Total Clicks Comparison */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Click Count by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredRedirectData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="auction_id" />
              <YAxis domain={[0, 10000]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="unique_clicks" name="Uniques" fill="#3b82f6" label={{ position: 'top', fontSize: 14 }} />
              <Bar dataKey="total_clicks" name="Total Clicks" fill="#10b981" label={{ position: 'top', fontSize: 14 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost Per Click by Auction Chart */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Cost Per Click by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredCostData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="auction_id" 
                label={{ value: 'Auction ID', position: 'insideBottomRight', offset: -10 }} 
              />
              <YAxis 
                domain={[0, 1]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                label={{ value: 'USD per Click', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip 
                formatter={(value, name) => {
                  return [formatCurrency(value as number), name];
                }}
              />
              <Legend />
              <Bar 
                dataKey="cost_per_click" 
                name="Cost Per Click" 
                fill="#8884d8"
                label={{ 
                  position: 'top', 
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => {
                    // Use a shorter currency format to save space
                    return "$" + value.toFixed(2);
                  },
                  fill: '#666',
                  fontSize: 16
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Winning Bid by Auction Chart */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Winning Bid by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredCostData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="auction_id" 
                label={{ value: 'Auction ID', position: 'insideBottomRight', offset: -10 }} 
              />
              <YAxis 
                domain={[0, 5000]}
                ticks={[1000, 2000, 3000, 4000, 5000]}
                label={{ value: 'USD', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip 
                formatter={(value, name) => {
                  return [formatCurrency(value as number), name];
                }}
              />
              <Legend />
              <Bar 
                dataKey="usd_value" 
                name="Winning Bid" 
                fill="#82ca9d"
                label={{ 
                  position: 'top', 
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => {
                    // Use a shorter currency format to save space
                    return "$" + value.toFixed(0);
                  },
                  fill: '#666',
                  fontSize: 16
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Click Sources Chart (5th position) */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-">
        <h4 className="text-lg font-medium mb-4">Click Sources Distribution</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredRedirectData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="auction_id" />
              <YAxis domain={[0, 10000]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="click_sources.popup" name="Popup" fill="#ff7300" stackId="a" />
              <Bar dataKey="click_sources.qr_arrow" name="QR Arrow" fill="#8884d8" stackId="a" />
              <Bar dataKey="click_sources.winner_image" name="Winner Image" fill="#ffc658" stackId="a" />
              <Bar dataKey="click_sources.winner_link" name="Winner Link" fill="#82ca9d" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Claims Analytics Component (uses cost per click data but changes terminology to "claims")
function ClaimsAnalytics() {
  const { address } = useAccount();
  const [data, setData] = useState<{
    auctionData: {
      auction_id: number;
      date: string;
      usd_value: number;
      click_count: number;
      cost_per_click: number;
    }[];
    stats?: {
      totalAuctions: number;
      auctionsWithClicks: number;
      totalClicks: number;
      totalUsdValue: number;
      minAuctionId: number;
      maxAuctionId: number;
      earliestAuctionIdWithClicks: number;
    };
    isLoading: boolean;
    error: Error | null;
  }>({
    auctionData: [],
    isLoading: true,
    error: null
  });
  
  // Filter states - initialize with null values since we don't know the range yet
  const [showOnlyWithClicks, setShowOnlyWithClicks] = useState(false);
  const [auctionRange, setAuctionRange] = useState<[number, number] | null>(null);
  
  useEffect(() => {
    if (!address) return;
    
    const fetchData = async () => {
      try {
        // Include the wallet address in the authorization header
        const response = await fetch('/api/cost-per-click', {
          headers: {
            'Authorization': `Bearer ${address}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const resultData = await response.json();
        
        // Set the initial auction range based on the data
        if (resultData.stats) {
          const minId = resultData.stats.earliestAuctionIdWithClicks || resultData.stats.minAuctionId;
          const maxId = resultData.stats.maxAuctionId;
          setAuctionRange([minId, maxId]);
        }
        
        setData({
          auctionData: resultData.auctionData,
          stats: resultData.stats,
          isLoading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching cost per click data:', error);
        setData(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error : new Error('An unknown error occurred')
        }));
      }
    };

    fetchData();
  }, [address]);

  // Apply filters to the auction data
  const filteredData = useMemo(() => {
    if (!data.auctionData || !auctionRange) return [];
    
    return data.auctionData
      .filter(item => {
        // Filter by auction ID range
        const inRange = item.auction_id >= auctionRange[0] && item.auction_id <= auctionRange[1];
        // Filter by click count if option is enabled
        const hasClicks = showOnlyWithClicks ? item.click_count > 0 : true;
        return inRange && hasClicks;
      })
      .sort((a, b) => a.auction_id - b.auction_id);
  }, [data.auctionData, auctionRange, showOnlyWithClicks]);

  if (data.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[300px] w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  <Skeleton className="h-4 w-40" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Error Loading Data</h3>
        <p className="text-red-700 dark:text-red-400">
          There was an error loading the cost per click data. Please try again later.
        </p>
      </div>
    );
  }

  // If we have no data yet
  if (data.auctionData.length === 0) {
    return (
      <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-amber-800 dark:text-amber-300 mb-2">No Data Available</h3>
        <p className="text-amber-700 dark:text-amber-400">
          Cost per click data is not available yet. This feature requires data from both winning bids and link visits.
        </p>
      </div>
    );
  }

  // If we don't have a range yet, show a loading state
  if (!auctionRange) {
    return (
      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">Preparing Data</h3>
        <p className="text-blue-700 dark:text-blue-400">
          Loading auction data and calculating metrics...
        </p>
      </div>
    );
  }

  // Calculate stats for the filtered data
  const filteredClicks = filteredData.reduce((sum, item) => sum + item.click_count, 0);
  const filteredSpent = filteredData.reduce((sum, item) => sum + item.usd_value, 0);
  const filteredAvgCostPerClick = filteredClicks > 0 ? filteredSpent / filteredClicks : 0;
  
  // Calculate stats for auctions with clicks
  const auctionsWithClicks = filteredData.filter(item => item.click_count > 0);
  const clickedAuctionsCount = auctionsWithClicks.length;
  
  // Format currency for tooltips
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div>
      {/* Wallet Balances Section */}
      <div className="mb-8">
        <WalletBalancesSection />
      </div>

      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">Cost Per Claim Analysis</h3>
        <p className="text-blue-700 dark:text-blue-400">
          Analyze how much bidders are paying per claim. Starting from auction #{data.stats?.earliestAuctionIdWithClicks}, which is the earliest auction with link claim data.
        </p>
        <div className="text-xs text-blue-600 dark:text-blue-500 mt-2">
          Note: &ldquo;Claims&rdquo; represent the total number of link visits on each auction&apos;s link, counting all records in the link_visit_claims table.
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
              Auction ID Range: {auctionRange[0]} - {auctionRange[1]}
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min={data.stats?.minAuctionId || 0}
                max={data.stats?.maxAuctionId || 100}
                value={auctionRange[0]}
                onChange={(e) => setAuctionRange([parseInt(e.target.value), auctionRange[1]])}
                className="flex-1"
              />
              <input
                type="range"
                min={data.stats?.minAuctionId || 0}
                max={data.stats?.maxAuctionId || 100}
                value={auctionRange[1]}
                onChange={(e) => setAuctionRange([auctionRange[0], parseInt(e.target.value)])}
                className="flex-1"
              />
            </div>
          </div>
          <div className="flex items-center">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyWithClicks}
                onChange={() => setShowOnlyWithClicks(!showOnlyWithClicks)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              <span className="ms-3 text-sm font-medium text-blue-800 dark:text-blue-300">
                Show only auctions with claims
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auctions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredData.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {clickedAuctionsCount} with claims ({Math.round(clickedAuctionsCount / filteredData.length * 100) || 0}%)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredClicks.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">
              Avg {(filteredClicks / clickedAuctionsCount).toFixed(1)} per auction with claims
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total USD Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredSpent)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Avg {formatCurrency(filteredSpent / filteredData.length)} per auction
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg. Cost Per Claim</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredAvgCostPerClick)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Based on auctions with &gt;0 claims
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Claim Count by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="auction_id" 
                label={{ value: 'Auction ID', position: 'insideBottomRight', offset: -10 }} 
              />
              <YAxis 
                domain={[0, 10000]}
                label={{ value: 'Number of Claims', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip />
              <Legend />
              <Bar 
                dataKey="click_count" 
                name="Claim Count" 
                fill="#ffc658"
                label={{ 
                  position: 'top',
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => value.toLocaleString(),
                  fill: '#666',
                  fontSize: 16
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Cost Per Claim by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="auction_id" 
                label={{ value: 'Auction ID', position: 'insideBottomRight', offset: -10 }} 
              />
              <YAxis 
                domain={[0, 1]}
                ticks={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}
                label={{ value: 'USD per Claim', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip 
                formatter={(value, name) => {
                  return [formatCurrency(value as number), name];
                }}
              />
              <Legend />
              <Bar 
                dataKey="cost_per_click" 
                name="Cost Per Claim" 
                fill="#8884d8"
                label={{ 
                  position: 'top', 
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => {
                    // Use a shorter currency format to save space
                    return "$" + value.toFixed(2);
                  },
                  fill: '#666',
                  fontSize: 16
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Winning Bid by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={filteredData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="auction_id" 
                label={{ value: 'Auction ID', position: 'insideBottomRight', offset: -10 }} 
              />
              <YAxis 
                domain={[0, 5000]}
                ticks={[1000, 2000, 3000, 4000, 5000]}
                label={{ value: 'USD', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip 
                formatter={(value, name) => {
                  return [formatCurrency(value as number), name];
                }}
              />
              <Legend />
              <Bar 
                dataKey="usd_value" 
                name="Winning Bid" 
                fill="#82ca9d"
                label={{ 
                  position: 'top', 
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => {
                    // Use a shorter currency format to save space
                    return "$" + value.toFixed(0);
                  },
                  fill: '#666',
                  fontSize: 16
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-lg font-medium">Auction Data</h4>
          <div className="text-sm text-gray-500">
            Showing {filteredData.length} of {data.auctionData.length} auctions
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3">Auction ID</th>
                <th className="text-left p-3">Date</th>
                <th className="text-right p-3">Winning Bid (USD)</th>
                <th className="text-right p-3">Claims</th>
                <th className="text-right p-3">Cost Per Claim</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, index) => (
                <tr key={index} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="p-3">{item.auction_id}</td>
                  <td className="p-3">{item.date}</td>
                  <td className="text-right p-3">{formatCurrency(item.usd_value)}</td>
                  <td className="text-right p-3">{item.click_count}</td>
                  <td className="text-right p-3">{item.click_count > 0 ? formatCurrency(item.cost_per_click) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { address, isConnected } = useAccount();
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check if the connected wallet is authorized
  useEffect(() => {
    if (isConnected && address) {
      const isAdmin = ADMIN_ADDRESSES.includes(address.toLowerCase());
      setIsAuthorized(isAdmin);
    } else {
      setIsAuthorized(false);
    }
  }, [address, isConnected]);

  if (!isConnected) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-3xl mx-auto pt-8">
          <div className="bg-amber-100 text-amber-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p>Please connect your wallet to access the admin dashboard.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-6xl mx-auto pt-8">
          <div className="bg-red-100 text-red-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">⚠️ Access Denied</h2>
            <p>
              You do not have permission to access the admin dashboard. Only
              authorized admin wallets can view this page.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">QR Auction Analytics Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Admin-only dashboard showing comprehensive analytics for QR auctions
          </p>
        </div>

        <div className="max-w-fit">
          <Tabs defaultValue="claims">
            <TabsList className="mb-6 flex flex-wrap h-auto">
            <TabsTrigger value="claims" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">Claims</TabsTrigger>
              <TabsTrigger value="clicks" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">Clicks</TabsTrigger>
              <TabsTrigger value="auctions" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">Auctions (TBU)</TabsTrigger>
              <TabsTrigger value="clanker" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">Clanker (TBU)</TabsTrigger>
              <TabsTrigger value="farcaster" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">FC notifs</TabsTrigger>
              <TabsTrigger value="testimonials" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">Testimonials</TabsTrigger>
              <TabsTrigger value="post-auction-checklist" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700 w-full">Post-Auction Checklist</TabsTrigger>
              <TabsTrigger value="boostcaster" className="px-[14.5px] border-r border-gray-200 dark:border-gray-700">Boostcaster</TabsTrigger>
            </TabsList>

            {/* Clicks Dashboard */}
            <TabsContent value="clicks">
              <ClicksAnalytics />
            </TabsContent>

            {/* Claims Dashboard */}
            <TabsContent value="claims">
              <ClaimsAnalytics />
            </TabsContent>

            {/* Auctions Analytics Dashboard (formerly Subgraph Analytics) */}
            <TabsContent value="auctions">
              <SubgraphAnalytics />
            </TabsContent>

            {/* Farcaster Analytics Dashboard */}
            <TabsContent value="farcaster">
              <FarcasterNotifications />
            </TabsContent>

            {/* Clanker Fees Dashboard */}
            <TabsContent value="clanker">
              <div className="p-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg mb-6">
                <h3 className="text-lg font-medium text-orange-800 dark:text-orange-300 mb-2">Clanker Analytics (TBU)</h3>
                <p className="text-orange-700 dark:text-orange-400">
                  This section will contain Clanker-specific analytics. Implementation coming soon.
                </p>
              </div>
            </TabsContent>

            {/* Testimonials Dashboard */}
            <TabsContent value="testimonials">
              <TestimonialsAdmin />
            </TabsContent>

            {/* Boostcaster Dashboard (formerly Smart Engagement) */}
            <TabsContent value="boostcaster">
              <EngagementManager />
            </TabsContent>

            {/* Post-Auction Checklist */}
            <TabsContent value="post-auction-checklist">
              <PostAuctionChecklist />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}


