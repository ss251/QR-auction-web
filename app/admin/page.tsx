"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import useEthPrice from "@/hooks/useEthPrice";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Dices } from "lucide-react";
import { useAuctionMetrics } from "@/hooks/useAuctionMetrics";
import { TestimonialsAdmin } from "./testimonials";
// Import recharts components
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

// Hook for Farcaster metrics
function useFarcasterMetrics() {
  const { address } = useAccount();
  const [metrics, setMetrics] = useState<{
    totalFrameUsers: number;
    usersAddedLastWeek: number;
    tokens: {
      total: number;
      enabled: number;
      disabled: number;
    };
    dailyGrowth: {
      date: string;
      newUsers: number;
      total: number;
    }[];
    isLoading: boolean;
    error: Error | null;
  }>({
    totalFrameUsers: 0,
    usersAddedLastWeek: 0,
    tokens: {
      total: 0,
      enabled: 0,
      disabled: 0
    },
    dailyGrowth: [],
    isLoading: true,
    error: null
  });

  useEffect(() => {
    if (!address) return;
    
    const fetchData = async () => {
      try {
        // Set authorization header with the wallet address for authentication
        const response = await fetch('/api/farcaster-metrics');
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        setMetrics({
          ...data,
          isLoading: false,
          error: null
        });
      } catch (error) {
        setMetrics(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error : new Error('An unknown error occurred')
        }));
      }
    };

    fetchData();
  }, [address]);

  return metrics;
}

// Farcaster Analytics Component
function FarcasterAnalytics() {
  const metrics = useFarcasterMetrics();

  if (metrics.isLoading) {
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

  if (metrics.error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Error Loading Data</h3>
        <p className="text-red-700 dark:text-red-400">
          There was an error loading the Farcaster user data. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="p-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-purple-800 dark:text-purple-300 mb-2">Farcaster Analytics</h3>
        <p className="text-purple-700 dark:text-purple-400">
          Real-time user statistics from Farcaster notifications system
        </p>
      </div>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4">User Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Active Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalFrameUsers}</div>
              <div className="text-xs text-gray-500 mt-1">
                {metrics.usersAddedLastWeek} registered in the last 7 days
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Enabled Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.tokens.enabled}</div>
              <div className="text-xs text-gray-500 mt-1">
                {Math.round(metrics.tokens.enabled / metrics.tokens.total * 100)}% of total tokens
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3 dark:bg-gray-700">
                <div className="bg-green-600 h-2.5 rounded-full" style={{ width: `${Math.round(metrics.tokens.enabled / metrics.tokens.total * 100)}%` }}></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Disabled Notifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.tokens.disabled}</div>
              <div className="text-xs text-gray-500 mt-1">
                {Math.round(metrics.tokens.disabled / metrics.tokens.total * 100)}% of total tokens
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3 dark:bg-gray-700">
                <div className="bg-red-600 h-2.5 rounded-full" style={{ width: `${Math.round(metrics.tokens.disabled / metrics.tokens.total * 100)}%` }}></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Cost Per Click Analytics Component
function CostPerClickAnalytics() {
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
      <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
        <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">Cost Per Click Analysis</h3>
        <p className="text-blue-700 dark:text-blue-400">
          Analyze how much bidders are paying per click. Starting from auction #{data.stats?.earliestAuctionIdWithClicks}, which is the earliest auction with link click data.
        </p>
        <div className="text-xs text-blue-600 dark:text-blue-500 mt-2">
          Note: &ldquo;Clicks&rdquo; represent the total number of link visits on each auction&apos;s link, counting all records in the link_visit_claims table.
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
            <div className="text-2xl font-bold">{filteredData.length}</div>
            <div className="text-xs text-gray-500 mt-1">
              {clickedAuctionsCount} with clicks ({Math.round(clickedAuctionsCount / filteredData.length * 100) || 0}%)
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
              Avg {(filteredClicks / clickedAuctionsCount).toFixed(1)} per auction with clicks
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
            <CardTitle className="text-sm font-medium">Avg. Cost Per Click</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredAvgCostPerClick)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Based on auctions with &gt;0 clicks
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Click Count by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
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
                label={{ value: 'Number of Clicks', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="click_count" 
                name="Click Count" 
                stroke="#ffc658" 
                activeDot={{ r: 8 }}
                label={{ 
                  position: 'top',
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => value.toLocaleString(),
                  fill: '#666',
                  fontSize: 10
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Cost Per Click by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
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
                label={{ value: 'USD per Click', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip 
                formatter={(value, name) => {
                  return [formatCurrency(value as number), name];
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="cost_per_click" 
                name="Cost Per Click" 
                stroke="#8884d8" 
                activeDot={{ r: 8 }} 
                label={{ 
                  position: 'top', 
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => {
                    // Use a shorter currency format to save space
                    return "$" + value.toFixed(2);
                  },
                  fill: '#666',
                  fontSize: 10
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Winning Bid by Auction</h4>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
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
                label={{ value: 'USD', angle: -90, position: 'insideLeft' }} 
              />
              <Tooltip 
                formatter={(value, name) => {
                  return [formatCurrency(value as number), name];
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="usd_value" 
                name="Winning Bid" 
                stroke="#82ca9d" 
                activeDot={{ r: 8 }}
                label={{ 
                  position: 'top', 
                  offset: 15,
                  angle: -45,
                  formatter: (value: number) => {
                    // Use a shorter currency format to save space
                    return "$" + value.toFixed(0);
                  },
                  fill: '#666',
                  fontSize: 10
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 mb-8">
        <h4 className="text-lg font-medium mb-4">Click Distribution by Auction</h4>
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
              <XAxis dataKey="auction_id" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="click_count" name="Clicks" fill="#8884d8" />
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
                <th className="text-right p-3">Clicks</th>
                <th className="text-right p-3">Cost Per Click</th>
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

// List of authorized admin addresses (lowercase for easy comparison)
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474"
];

// Dune API key
const DUNE_API_KEY = process.env.NEXT_PUBLIC_DUNE_API_KEY;

// Dune query IDs
const DUNE_QUERY_IDS = {
  clankerFees: "4950249", // Clanker fees query ID
};

// Types for analytics data
type ClankerFeesData = {
  day: string;
  tx_count: number;
  total_transferred: number;
  total_fee: number;
  total_creator_reward: number;
  total_clanker_fee: number;
};

// Define a type for the raw data from Dune
type ClankerRowData = {
  day: string;
  tx_count: string | number;
  total_transferred: string | number;
  total_fee: string | number;
  total_creator_reward: string | number;
  total_clanker_fee: string | number;
};

export default function AdminDashboard() {
  const { address, isConnected } = useAccount();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clankerData, setClankerData] = useState<ClankerFeesData | null>(null);
  const [clankerDailyData, setClankerDailyData] = useState<ClankerFeesData[]>([]);
  
  // Filtering state for Clanker data
  const [sortField, setSortField] = useState<keyof ClankerFeesData>("day");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Filter and sort clanker daily data
  const filteredClankerData = useMemo(() => {
    if (!clankerDailyData.length) return [];
    
    // Sort by selected field
    const sorted = [...clankerDailyData].sort((a, b) => {
      if (sortField === "day") {
        // For dates, we need special handling
        const dateA = new Date(a.day);
        const dateB = new Date(b.day);
        return sortDirection === "asc" 
          ? dateA.getTime() - dateB.getTime() 
          : dateB.getTime() - dateA.getTime();
      }
      
      // For numeric fields
      const valueA = a[sortField] as number;
      const valueB = b[sortField] as number;
      
      return sortDirection === "asc" ? valueA - valueB : valueB - valueA;
    });
    
    return sorted;
  }, [clankerDailyData, sortField, sortDirection]);
  
  // Handle column sort 
  const handleSort = (field: keyof ClankerFeesData) => {
    if (sortField === field) {
      // Toggle direction if already sorting by this field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new sort field with default desc direction
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Use the hooks for price data
  useEthPrice(); // Keep the hook without destructuring
  const { 
    priceUsd: qrPrice, 
    isLoading: qrPriceLoading,
    formatAmountToUsd
  } = useTokenPrice();

  // Check if the connected wallet is authorized
  useEffect(() => {
    if (isConnected && address) {
      const isAdmin = ADMIN_ADDRESSES.includes(address.toLowerCase());
      setIsAuthorized(isAdmin);
    } else {
      setIsAuthorized(false);
    }
  }, [address, isConnected]);

  // Fetch data from Dune API
  useEffect(() => {
    if (!isAuthorized) return;

    const fetchDuneData = async (queryId: string) => {
      try {
        const response = await fetch(
          `https://api.dune.com/api/v1/query/${queryId}/results?limit=1000`,
          {
            headers: {
              "X-Dune-API-Key": DUNE_API_KEY || "",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Dune API error: ${response.status}`);
        }

        return await response.json();
      } catch (error) {
        console.error("Error fetching Dune data:", error);
        return null;
      }
    };

    const loadAllData = async () => {
      setLoading(true);

      // Fetch Clanker fees
      const clankerResponse = await fetchDuneData(DUNE_QUERY_IDS.clankerFees);
      if (clankerResponse && clankerResponse.result && clankerResponse.result.rows.length > 0) {
        // Store daily data
        const dailyData = clankerResponse.result.rows.map((row: ClankerRowData) => ({
          day: new Date(row.day).toLocaleDateString(),
          tx_count: Number(row.tx_count),
          total_transferred: Number(row.total_transferred),
          total_fee: Number(row.total_fee),
          total_creator_reward: Number(row.total_creator_reward),
          total_clanker_fee: Number(row.total_clanker_fee)
        }));
        setClankerDailyData(dailyData);
        
        // Aggregate data for totals
        const aggregateData = clankerResponse.result.rows.reduce((acc: ClankerFeesData, row: ClankerRowData) => {
          return {
            day: 'All Time',
            tx_count: (acc.tx_count || 0) + Number(row.tx_count),
            total_transferred: (acc.total_transferred || 0) + Number(row.total_transferred),
            total_fee: (acc.total_fee || 0) + Number(row.total_fee),
            total_creator_reward: (acc.total_creator_reward || 0) + Number(row.total_creator_reward),
            total_clanker_fee: (acc.total_clanker_fee || 0) + Number(row.total_clanker_fee)
          };
        }, { day: 'All Time', tx_count: 0, total_transferred: 0, total_fee: 0, total_creator_reward: 0, total_clanker_fee: 0 });
        
        setClankerData(aggregateData);
      }

      setLoading(false);
    };

    loadAllData();
  }, [isAuthorized]);

  const formatNumber = (num: number, decimals = 2) => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatQrValue = (qrValue: number) => {
    return `${formatNumber(qrValue, 0)} $QR`;
  };

  // Calculate USD values from QR amounts in V2 data
  const getV2UsdValue = (qrAmount: number) => {
    if (qrPriceLoading || !qrPrice) return '-';
    return formatAmountToUsd(qrAmount);
  };

  if (!isConnected) {
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="max-w-6xl mx-auto pt-8">
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

        <Tabs defaultValue="subgraph">
          <TabsList className="mb-6">
            <TabsTrigger value="subgraph">Subgraph Analytics</TabsTrigger>
            <TabsTrigger value="clanker">Clanker Fees</TabsTrigger>
            <TabsTrigger value="farcaster">Farcaster</TabsTrigger>
            <TabsTrigger value="costperclick">Cost Per Click</TabsTrigger>
            <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          </TabsList>

          {/* Subgraph Analytics Dashboard */}
          <TabsContent value="subgraph">
            <SubgraphAnalytics />
          </TabsContent>

          {/* Clanker Fees Dashboard */}
          <TabsContent value="clanker">
            <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
              <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">Clanker Fees Analysis</h3>
              <p className="text-blue-700 dark:text-blue-400">
                Displaying fee data for Clanker protocol (1% fee on QR token transactions)
              </p>
            </div>

            <h3 className="text-lg font-medium mb-4">Total Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? <Skeleton className="h-8 w-20" /> : clankerData?.tx_count || 0}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total QR Transferred</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      formatQrValue(clankerData?.total_transferred || 0)
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {loading ? (
                      <Skeleton className="h-4 w-16" />
                    ) : (
                      getV2UsdValue(clankerData?.total_transferred || 0)
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Fees Collected</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      formatQrValue(clankerData?.total_fee || 0)
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {loading ? (
                      <Skeleton className="h-4 w-16" />
                    ) : (
                      getV2UsdValue(clankerData?.total_fee || 0)
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Creator Rewards (40%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      formatQrValue(clankerData?.total_creator_reward || 0)
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {loading ? (
                      <Skeleton className="h-4 w-16" />
                    ) : (
                      getV2UsdValue(clankerData?.total_creator_reward || 0)
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Clanker Cut (60%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {loading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      formatQrValue(clankerData?.total_clanker_fee || 0)
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {loading ? (
                      <Skeleton className="h-4 w-16" />
                    ) : (
                      getV2UsdValue(clankerData?.total_clanker_fee || 0)
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Breakdown with sortable columns */}
            <h3 className="text-lg font-medium mt-8 mb-4">Daily Breakdown</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th onClick={() => handleSort("day")} className="text-left p-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center gap-1">
                        Date
                        {sortField === "day" && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("tx_count")} className="text-right p-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-end gap-1">
                        Transactions
                        {sortField === "tx_count" && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("total_transferred")} className="text-right p-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-end gap-1">
                        QR Transferred
                        {sortField === "total_transferred" && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("total_fee")} className="text-right p-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-end gap-1">
                        Total Fees
                        {sortField === "total_fee" && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("total_creator_reward")} className="text-right p-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-end gap-1">
                        Creator Reward
                        {sortField === "total_creator_reward" && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort("total_clanker_fee")} className="text-right p-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-end gap-1">
                        Clanker Cut
                        {sortField === "total_clanker_fee" && (
                          <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center p-6">
                        <Skeleton className="h-4 w-full mx-auto" />
                        <Skeleton className="h-4 w-full mx-auto mt-2" />
                        <Skeleton className="h-4 w-full mx-auto mt-2" />
                      </td>
                    </tr>
                  ) : filteredClankerData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-6 text-gray-500">
                        No data available
                      </td>
                    </tr>
                  ) : (
                    filteredClankerData.map((day, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="p-3">{day.day}</td>
                        <td className="text-right p-3">{day.tx_count}</td>
                        <td className="text-right p-3">
                          <div>{formatNumber(day.total_transferred, 0)} $QR</div>
                          <div className="text-xs text-gray-500">
                            {getV2UsdValue(day.total_transferred)}
                          </div>
                        </td>
                        <td className="text-right p-3">
                          <div>{formatNumber(day.total_fee, 0)} $QR</div>
                          <div className="text-xs text-gray-500">
                            {getV2UsdValue(day.total_fee)}
                          </div>
                        </td>
                        <td className="text-right p-3">
                          <div>{formatNumber(day.total_creator_reward, 0)} $QR</div>
                          <div className="text-xs text-gray-500">
                            {getV2UsdValue(day.total_creator_reward)}
                          </div>
                        </td>
                        <td className="text-right p-3">
                          <div>{formatNumber(day.total_clanker_fee, 0)} $QR</div>
                          <div className="text-xs text-gray-500">
                            {getV2UsdValue(day.total_clanker_fee)}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Dune Query Link */}
            <div className="flex items-center justify-end mt-4 mb-8">
              <a
                href={`https://dune.com/queries/${DUNE_QUERY_IDS.clankerFees}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 flex items-center"
              >
                <Dices className="h-4 w-4 mr-1" />
                View Dune Query
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </div>
          </TabsContent>

          {/* Farcaster Analytics Dashboard */}
          <TabsContent value="farcaster">
            <FarcasterAnalytics />
          </TabsContent>

          {/* Cost Per Click Analytics Dashboard */}
          <TabsContent value="costperclick">
            <CostPerClickAnalytics />
          </TabsContent>

          {/* Testimonials Dashboard */}
          <TabsContent value="testimonials">
            <TestimonialsAdmin />
          </TabsContent>
        </Tabs>

        {/* Additional metrics placeholders */}
        <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg mt-8">
          <h3 className="text-lg font-medium mb-2">Additional Metrics (Placeholder)</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            These metrics would require additional data sources:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
            <li>Percentage of bids with Farcaster names</li>
            <li>Referrer analytics (Twitter, Warpcast, Google Search)</li>
            <li>Wallet type breakdown (Mobile vs Web)</li>
            <li>Total page views (Mobile vs Web)</li>
            <li>Unique page views (Mobile vs Web)</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
