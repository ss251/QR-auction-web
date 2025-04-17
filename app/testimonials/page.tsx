"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useBaseColors } from "@/hooks/useBaseColors";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { QRContextMenu } from "@/components/QRContextMenu";
import { ThemeDialog } from "@/components/ThemeDialog";
import { TwitterEmbed } from "@/components/TwitterEmbed";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from 'wagmi';
import { XLogo } from "@/components/XLogo";
import { DexscreenerLogo } from "@/components/DexScannerLogo";
import { UniswapLogo } from "@/components/UniswapLogo";
import { Copy, Check } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import "react-farcaster-embed/dist/styles.css"; // Import the default styles

interface Testimonial {
  id: number;
  url: string;
  type: 'warpcast' | 'twitter';
  author?: string;
  content?: string;
  is_approved: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  priority: number;
}

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { isConnected } = useAccount();
  
  const isBaseColors = useBaseColors();
  const router = useRouter();
  
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
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    const fetchTestimonials = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/testimonials');
        if (!response.ok) {
          throw new Error(`Failed to fetch testimonials: ${response.status}`);
        }
        
        const data = await response.json();
        setTestimonials(data.testimonials || []);
      } catch (error) {
        console.error('Error fetching testimonials:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTestimonials();
  }, []);
  
  const handleLogoClick = () => {
    router.push('/');
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

      <div className="z-10 mt-6 md:mt-12 mb-12 w-full flex flex-col items-center justify-center px-4">
        <div className="max-w-6xl w-full flex flex-col space-y-6">  
          <div className="flex flex-col space-y-3 text-center">
            <h1 className="text-2xl md:text-4xl font-bold text-center">
              <span className="flex items-center justify-center gap-2">
                
                Wall of Love
              </span>
            </h1>
            <p className="text-gray-500 text-center">
              See what the QR community is saying
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-5">
          {loading ? (
            // Improved loading skeletons that match embed styles
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="w-full flex justify-center">
                <div className="w-full max-w-xl">
                  <div className="p-5 border border-gray-200 rounded-xl bg-white shadow-sm">
                    {/* Header with profile pic and name */}
                    <div className="flex items-start space-x-3 mb-4">
                      <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-baseline space-x-2">
                          <Skeleton className="h-5 w-28" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                        <Skeleton className="h-3 w-24 mt-1" />
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="space-y-2 mb-4">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                    
                    {/* Image/embed */}
                    <Skeleton className="h-52 w-full rounded-lg my-4" />
                    
                    {/* Footer with engagement metrics */}
                    <div className="flex items-center mt-4 space-x-6">
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : testimonials.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500">No testimonials found</p>
            </div>
          ) : (
            // Render testimonials
            testimonials.map((testimonial) => (
              <div key={testimonial.id} className="w-full flex justify-center">
                {testimonial.type === 'warpcast' ? (
                  <div className="max-w-xl w-full px-0 md:px-[50px]">
                    <FarcasterEmbed url={testimonial.url} />
                  </div>
                ) : (
                  <div className="max-w-xl w-full overflow-hidden rounded-xl px-0 md:px-[50px]">
                    <TwitterEmbed tweetUrl={testimonial.url} />
                  </div>
                )}
              </div>
            ))
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