"use client";

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TwitterEmbed } from '@/components/TwitterEmbed';
import "react-farcaster-embed/dist/styles.css";
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import Link from 'next/link';
interface Testimonial {
  id: number;
  url: string;
  type: 'warpcast' | 'twitter';
}

// Hardcoded testimonials as requested
const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    url: 'https://warpcast.com/mleejr/0xcccf69651de22dea1f565a8f3248fd5fb9dd2a56',
    type: 'warpcast'
  },
  {
    id: 2,
    url: 'https://warpcast.com/tldr/0x600e5117f2d9eb4c65fb1012b8b7897123f9d7d5',
    type: 'warpcast'
  },
  {
    id: 3,
    url: 'https://x.com/BasedBraden/status/1912190908914901036',
    type: 'twitter'
  }
];

export function EndorsementsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const autoplayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Start auto-rotation
    startAutoRotation();
    
    return () => {
      // Cleanup interval on component unmount
      if (autoplayIntervalRef.current) {
        clearInterval(autoplayIntervalRef.current);
      }
    };
  }, []);
  
  const startAutoRotation = () => {
    if (autoplayIntervalRef.current) {
      clearInterval(autoplayIntervalRef.current);
    }
    
    // Auto-rotate every 10 seconds
    autoplayIntervalRef.current = setInterval(() => {
      handleChangeSlide('next');
    }, 10000);
  };
  
  const handleChangeSlide = (direction: 'prev' | 'next') => {
    // Prevent rapid clicks during transition
    if (isTransitioning) return;
    
    // Start transition
    setIsTransitioning(true);
    
    setTimeout(() => {
      // Update index after fade out
      if (direction === 'next') {
        setCurrentIndex((prevIndex) => 
          prevIndex === TESTIMONIALS.length - 1 ? 0 : prevIndex + 1
        );
      } else {
        setCurrentIndex((prevIndex) => 
          prevIndex === 0 ? TESTIMONIALS.length - 1 : prevIndex - 1
        );
      }
      
      // Reset transition flag after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
      }, 400); // Slightly longer than CSS transition to ensure completion
    }, 200);
    
    // Reset autoplay timer
    startAutoRotation();
  };
  
  // Handle click on a Farcaster embed to open the original URL
  const handleEmbedClick = (url: string) => {
    window.open(url, '_blank');
  };
  
  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <div className="relative">
          <div className="overflow-hidden">
            <div className="flex justify-center">
              <div className="h-[300px] w-full max-w-xl relative">
                <div className="p-4 w-full h-full overflow-y-auto flex items-center justify-center">
                  <div 
                    className={`transition-opacity duration-400 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'} w-full`} 
                  >
                    {TESTIMONIALS[currentIndex]?.type === 'warpcast' ? (
                      <div 
                        className="cursor-pointer" 
                        onClick={() => handleEmbedClick(TESTIMONIALS[currentIndex].url)}
                      >
                        <FarcasterEmbed url={TESTIMONIALS[currentIndex].url} />
                      </div>
                    ) : (
                      <TwitterEmbed tweetUrl={TESTIMONIALS[currentIndex].url} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="relative max-w-xl mx-auto">
            {/* Navigation arrows centered */}
            <div className="flex justify-center mt-4 gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handleChangeSlide('prev')}
                className="rounded-full"
                disabled={isTransitioning}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => handleChangeSlide('next')}
                className="rounded-full"
                disabled={isTransitioning}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {/* See more link positioned at right edge */}
            <div className="absolute right-0 bottom-0 mb-2 pr-4">
              <Link 
                href="/love"
                className="text-sm font-medium text-[#472B92] hover:underline"
              >
                See more →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 