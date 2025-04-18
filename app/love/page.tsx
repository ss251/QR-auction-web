"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBaseColors } from "@/hooks/useBaseColors";
import { useRouter } from "next/navigation";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { QRContextMenu } from "@/components/QRContextMenu";
import { ThemeDialog } from "@/components/ThemeDialog";
import { TweetEmbed } from "@/components/TweetEmbed";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from 'wagmi';
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { Copy, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import "react-farcaster-embed/dist/styles.css";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

interface Testimonial {
  id: number;
  url: string;
  type: 'warpcast' | 'twitter';
  author?: string;
  content?: string;
  is_approved: boolean;
  is_featured: boolean;
  carousel?: boolean;
  created_at: string;
  updated_at: string;
  priority: number;
}

export default function WallOfLovePage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [carouselItems, setCarouselItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 10;
  
  const { isConnected } = useAccount();
  const isBaseColors = useBaseColors();
  const router = useRouter();

  // Fetch carousel items first
  const fetchCarouselItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .eq('is_approved', true)
        .eq('carousel', true)
        .order('priority', { ascending: false });
        
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} carousel items`);
        setCarouselItems(data);
      }
    } catch (error) {
      console.error('Error fetching carousel items:', error);
    }
  }, []);

  const fetchTestimonials = useCallback(async (pageNumber: number) => {
    try {
      if (pageNumber === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      console.log(`Fetching page ${pageNumber}, from ${pageNumber * PAGE_SIZE} to ${(pageNumber + 1) * PAGE_SIZE - 1}`);
      
      const from = pageNumber * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      // Exclude carousel items from regular testimonials
      const { data, error, count } = await supabase
        .from('testimonials')
        .select('*', { count: 'exact' })
        .eq('is_approved', true)
        .eq('carousel', false) // Exclude carousel items
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
        
      if (error) {
        throw error;
      }
      
      console.log(`Received ${data?.length || 0} items, total count: ${count}`);
      
      // Check if we received data
      if (!data || data.length === 0) {
        setHasMore(false);
        console.log('No more items to load');
        return;
      }
      
      if (pageNumber === 0) {
        setTestimonials(data);
      } else {
        setTestimonials(prev => [...prev, ...data]);
      }
      
      // Check if there are more testimonials to load
      const currentTotalLoaded = from + data.length;
      const hasMoreItems = count !== null && count !== undefined && currentTotalLoaded < count;
      console.log(`Current total loaded: ${currentTotalLoaded}, Has more: ${hasMoreItems}`);
      setHasMore(hasMoreItems);
      
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);
  
  // Observer callback for infinite scroll
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    if (entry.isIntersecting && hasMore && !loadingMore) {
      console.log('Loading more posts, current page:', page);
      setPage(prevPage => prevPage + 1);
    }
  }, [hasMore, loadingMore, page]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!loading) { // Only observe when initial loading is complete
      const options = {
        root: null,
        rootMargin: '600px', // Increased for earlier detection
        threshold: 0.1
      };
      
      const observer = new IntersectionObserver(handleObserver, options);
      
      if (loaderRef.current) {
        observer.observe(loaderRef.current);
      }
      
      return () => {
        if (loaderRef.current) {
          observer.unobserve(loaderRef.current);
        }
      };
    }
  }, [handleObserver, loading]);

  // Reset everything on component mount and fetch carousel items
  useEffect(() => {
    console.log("Component mounted, resetting state");
    setPage(0);
    setTestimonials([]);
    setCarouselItems([]);
    setHasMore(true);
    
    // Fetch carousel items first
    fetchCarouselItems();
    // fetchTestimonials(0) will be called by the page effect
  }, [fetchCarouselItems]);

  // Load more testimonials when page changes
  useEffect(() => {
    console.log('Page changed to:', page);
    fetchTestimonials(page);
  }, [page, fetchTestimonials]);
  
  const handleLogoClick = () => {
    router.push('/');
  };
  
  // Open Warpcast compose URL
  const handleCastClick = () => {
    window.open('https://warpcast.com/~/compose?text=we%20like%20%40qrcoindotfun', '_blank');
  };

  // Open Twitter compose URL
  const handleTweetClick = () => {
    window.open('https://twitter.com/intent/tweet?text=we%20like%20%40qrcoindotfun', '_blank');
  };
  
  // Handle click on a Farcaster embed to open the original URL
  const handleFarcasterEmbedClick = (url: string) => {
    window.open(url, '_blank');
  };
  
  const contractAddress = process.env.NEXT_PUBLIC_QR_COIN as string;
  const copyToClipboard = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info("CA copied!");
  };

  // Add custom CSS to fix video embeds and Twitter spacing
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Fix for Twitter embed whitespace */
      .twitter-tweet, 
      .twitter-tweet-rendered, 
      .twitter-embed-fixed,
      .twitter-tweet-rendered iframe {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
      }
      
      /* Fix for Farcaster video player */
      .cast-body video,
      media-controller,
      hls-video,
      .farcaster-embed-video-player {
        max-width: 100%;
        height: auto !important;
        aspect-ratio: 16/9;
        z-index: 10 !important;
        position: relative !important;
      }
      
      /* Ensure video container has proper dimensions */
      .farcaster-embed-video-container {
        position: relative !important;
        z-index: 5 !important;
        width: 100% !important;
        min-height: 200px !important;
      }
      
      /* Fix media-chrome controls */
      media-control-bar {
        z-index: 20 !important;
        position: relative !important;
      }
      
      /* Remove extra padding in Twitter embeds */
      .twitter-tweet, .twitter-tweet-rendered {
        padding: 0 !important;
      }
      
      /* Fix for quoted Farcaster casts on mobile */
      @media (max-width: 640px) {
        .farcaster-embed-quote {
          display: block !important;
          width: 100% !important;
        }
        
        .farcaster-embed-quote-cast-container {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
        }
        
        .farcaster-embed-quote-cast {
          width: 100% !important;
          word-break: break-word !important;
        }
        
        .farcaster-embed-image-container img {
          max-width: 100% !important;
          height: auto !important;
        }
        
        .farcaster-embed-body {
          width: 100% !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
        }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <nav className="w-full md:max-w-3xl mx-auto flex justify-between items-center mb-8 mt-8 md:mt-4 lg:mt-4 lg:mb-8">
        <QRContextMenu className="inline-block" isHeaderLogo>
          <h1
            onClick={handleLogoClick}
            className="text-2xl font-bold cursor-pointer"
          >
            $QR
          </h1>
        </QRContextMenu>
        <div className="flex items-center gap-1 md:gap-3">
          <Link href="/about">
            <Button
              variant="outline"
              className={isConnected ? "h-10 px-3 text-sm font-medium" : "h-10 w-10 md:w-auto md:px-3 md:text-sm md:font-medium"}
            >
              <span className="md:hidden text-lg">{isConnected ? "What is this?" : "?"}</span>
              <span className="hidden md:inline">What is this?</span>
            </Button>
          </Link>

          <Link href="/winners">
            <Button
                variant="outline"
                size="icon"
                className={
                isBaseColors
                    ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10"
                    : "h-10 w-10"
                }
            >
                <div className="h-5 w-5 flex items-center justify-center">
                🏆
                </div>
                </Button>
          </Link>
          
          <Button
            variant="outline"
            size="icon"
            className={
              isBaseColors
                ? "bg-primary text-foreground hover:bg-primary/90 hover:text-foreground border-none h-10 w-10"
                : "h-10 w-10"
            }
            onClick={() => setThemeDialogOpen(true)}
          >
            <div className="h-5 w-5 flex items-center justify-center">
              {isBaseColors ? (
                <img 
                  src="/basecolors2.jpeg" 
                  alt="Theme toggle - base colors"
                  className="h-5 w-5 object-cover"
                />
              ) : (
                <img 
                  src="/basecolors.jpeg" 
                  alt="Theme toggle - light/dark" 
                  className="h-5 w-5 object-cover border"
                />
              )}
            </div>
          </Button>
          
          <div className="relative">
            <ConnectButton
              accountStatus={{
                smallScreen: "avatar",
                largeScreen: "full",
              }}
              chainStatus="none"
              showBalance={false}
              label="Connect Wallet"
            />
            <div className="absolute right-0 top-full mt-2 pr-1">
              <ConnectionIndicator />
            </div>
          </div>
        </div>
      </nav>

      <div className="z-10 mb-8 w-full flex flex-col items-center justify-center px-4">
        <div className="max-w-6xl w-full flex flex-col space-y-6">  
          <div className="flex flex-col space-y-3 text-center">
            <h1 className="text-2xl md:text-3xl font-bold text-center">
              <span className="flex items-center justify-center gap-2">
                Wall of Love
              </span>
            </h1>
            
            {/* Tweet & Cast buttons */}
            <div className="flex justify-center gap-4 mt-2">
              <Button 
                onClick={handleTweetClick}
                className={`w-28 ${
                  isBaseColors
                    ? "bg-primary text-secondary hover:bg-primary/90"
                    : "bg-[#1C9BEF] text-white hover:bg-[#1A8CD8] dark:bg-[#1C9BEF] dark:text-white dark:hover:bg-[#1A8CD8]"
                }`}
              >
                Tweet
              </Button>
              <Button 
                onClick={handleCastClick}
                className="w-28 bg-[#472B92] text-white hover:bg-[#3b2277]"
              >
                Cast
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-8">
          {loading ? (
            // Initial loading skeletons
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="w-full flex justify-center">
                <div className="max-w-xl w-full px-0 md:px-[50px]">
                  {/* Alternating between Warpcast and Twitter-style skeletons */}
                  {i % 2 === 0 ? (
                    // Warpcast-style skeleton
                    <div className={`p-4 border rounded-xl shadow-sm ${
                      isBaseColors 
                        ? "bg-primary/5 border-primary/10" 
                        : "bg-white border-gray-200 dark:bg-gray-950 dark:border-gray-800"
                    }`}>
                      {/* Header with profile pic and name */}
                      <div className="flex items-start space-x-3 mb-4">
                        <Skeleton className={`h-10 w-10 rounded-full flex-shrink-0 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline space-x-2">
                            <Skeleton className={`h-5 w-24 ${isBaseColors ? "bg-primary/20" : ""}`} />
                            <Skeleton className={`h-4 w-16 ml-1 ${isBaseColors ? "bg-primary/20" : ""}`} />
                          </div>
                          <Skeleton className={`h-3 w-32 mt-1 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        {/* Farcaster logo placeholder */}
                        <div className="h-6 w-6 rounded-full bg-[#472B92] opacity-40 flex-shrink-0"></div>
                      </div>
                      
                      {/* Content */}
                      <div className="space-y-2 mb-4 overflow-hidden">
                        <Skeleton className={`h-4 w-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-4 w-11/12 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-4 w-4/5 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      </div>
                      
                      {/* Image placeholder - appears in some casts */}
                      {i === 0 && (
                        <Skeleton className={`h-48 w-full rounded-lg my-4 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      )}
                      
                      {/* Footer with reactions */}
                      <div className={`flex items-center pt-2 space-x-6 mt-4 border-t ${
                        isBaseColors ? "border-primary/10" : "border-gray-100 dark:border-gray-800"
                      }`}>
                        <div className="flex items-center space-x-1">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-6 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex items-center space-x-1">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-6 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex items-center space-x-1">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-6 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Twitter-style skeleton
                    <div className={`p-4 border rounded-xl shadow-sm ${
                      isBaseColors 
                        ? "bg-primary/5 border-primary/10" 
                        : "bg-white border-gray-200 dark:bg-gray-950 dark:border-gray-800"
                    }`}>
                      {/* Header with profile pic and name */}
                      <div className="flex items-start space-x-3 mb-4">
                        <Skeleton className={`h-12 w-12 rounded-full flex-shrink-0 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline space-x-2">
                            <Skeleton className={`h-5 w-32 ${isBaseColors ? "bg-primary/20" : ""}`} />
                            <Skeleton className={`h-4 w-24 ${isBaseColors ? "bg-primary/20" : ""}`} />
                          </div>
                          <Skeleton className={`h-3 w-40 mt-1 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        {/* Twitter logo placeholder */}
                        <div className="h-5 w-5 rounded-full bg-[#1C9BEF] opacity-40 flex-shrink-0"></div>
                      </div>
                      
                      {/* Content */}
                      <div className="space-y-2 mb-4 overflow-hidden">
                        <Skeleton className={`h-5 w-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-5 w-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                        <Skeleton className={`h-5 w-3/4 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      </div>
                      
                      {/* Image/embed - every other Twitter skeleton has image */}
                      {i === 1 && (
                        <Skeleton className={`h-64 w-full rounded-xl my-4 ${isBaseColors ? "bg-primary/20" : ""}`} />
                      )}
                      
                      {/* Footer with engagement metrics */}
                      <div className={`flex items-center justify-between pt-3 w-full mt-4 border-t ${
                        isBaseColors ? "border-primary/10" : "border-gray-100 dark:border-gray-800"
                      }`}>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                        <div className="flex space-x-1 items-center">
                          <Skeleton className={`h-4 w-4 rounded-full ${isBaseColors ? "bg-primary/20" : ""}`} />
                          <Skeleton className={`h-3 w-8 ${isBaseColors ? "bg-primary/20" : ""}`} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (carouselItems.length === 0 && testimonials.length === 0) ? (
            <div className="text-center py-10">
              <p className="text-gray-500">No testimonials found</p>
            </div>
          ) : (
            // Render testimonials with carousel items first
            <>
              {/* Display carousel items first */}
              {carouselItems.map((testimonial) => (
                <div key={`carousel-${testimonial.id}`} className="w-full flex justify-center">
                  <div className="max-w-xl w-full px-0 md:px-[50px]">
                    {testimonial.type === 'warpcast' ? (
                      <div 
                        className="cursor-pointer" 
                        onClick={() => handleFarcasterEmbedClick(testimonial.url)}
                      >
                        <FarcasterEmbed url={testimonial.url} />
                      </div>
                    ) : (
                      <div className="overflow-hidden">
                        <TweetEmbed 
                          tweetUrl={testimonial.url} 
                          showLoader={true} 
                          onClick={() => window.open(testimonial.url, '_blank')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Then display regular testimonials */}
              {testimonials.map((testimonial) => (
                <div key={`regular-${testimonial.id}`} className="w-full flex justify-center">
                  <div className="max-w-xl w-full px-0 md:px-[50px]">
                    {testimonial.type === 'warpcast' ? (
                      <div 
                        className="cursor-pointer" 
                        onClick={() => handleFarcasterEmbedClick(testimonial.url)}
                      >
                        <FarcasterEmbed url={testimonial.url} />
                      </div>
                    ) : (
                      <div className="overflow-hidden">
                        <TweetEmbed 
                          tweetUrl={testimonial.url} 
                          showLoader={true} 
                          onClick={() => window.open(testimonial.url, '_blank')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Loading indicator for infinite scroll */}
              <div 
                ref={loaderRef}
                className="w-full flex justify-center py-4"
              >
                {loadingMore && (
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                )}
                {!hasMore && testimonials.length > 0 && (
                  <p className="text-gray-500 text-sm">You&apos;ve reached the end!</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      <footer className="mt-10 text-center flex flex-col items-center">
        <div className="flex items-center justify-center gap-6 mb-3">
          <a
            href="https://x.com/QRcoindotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="X (formerly Twitter)"
          >
            <XLogo />
          </a>
          <a
            href="https://dexscreener.com/base/0xf02c421e15abdf2008bb6577336b0f3d7aec98f0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Dexscreener"
          >
            <DexscreenerLogo />
          </a>
          <a
            href="https://app.uniswap.org/swap?outputCurrency=0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF&chain=base"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:opacity-80 transition-opacity"
            aria-label="Uniswap"
          >
            <UniswapLogo />
          </a>
        </div>
        <div
          className="inline-flex items-center text-gray-600 dark:text-[#696969] hover:text-gray-900 transition-colors text-[12px] md:text-[15px] font-mono whitespace-nowrap cursor-pointer"
          onClick={copyToClipboard}
        >
          <label
            className={clsx(
              isBaseColors ? "text-foreground" : "",
              "mr-1 cursor-pointer"
            )}
          >
            CA: {contractAddress}
          </label>
          <button
            onClick={copyToClipboard}
            className={clsx(
              isBaseColors
                ? " text-foreground hover:text-primary/90"
                : "hover:bg-gray-100",
              "p-1 rounded-full transition-colors"
            )}
            aria-label="Copy contract address"
          >
            {copied ? (
              <Check
                className={clsx(
                  isBaseColors ? "text-foreground" : "text-green-500",
                  "h-3 w-3"
                )}
              />
            ) : (
              <Copy className="h-3 w-3 cursor-pointer" />
            )}
          </button>
        </div>
      </footer>
      
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </main>
  );
} 