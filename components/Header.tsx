'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomWallet } from '@/components/CustomWallet';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { ThemeDialog } from '@/components/ThemeDialog';
import { QRContextMenu } from '@/components/QRContextMenu';
import { useBaseColors } from '@/hooks/useBaseColors';

export function Header() {
  const router = useRouter();
  const isBaseColors = useBaseColors();
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);

  const handleLogoClick = () => {
    // Navigate to the root (which usually shows the latest auction or redirects)
    router.push('/'); 
  };

  return (
    <nav className="w-full md:max-w-3xl mx-auto flex justify-between items-center mt-20 md:mt-8 lg:mt-20 lg:mb-8 px-4 md:px-0">
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
            className={"h-10 w-10 md:w-auto md:px-3 md:text-sm md:font-medium"}
          >
            <span className="md:hidden text-lg">?</span>
            <span className="hidden md:inline text-lg mx-0.5">?</span>
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
          <CustomWallet />
          <div className="absolute right-0 top-full mt-2 pr-1 z-50"> {/* Added z-index */} 
            <ConnectionIndicator />
          </div>
        </div>
      </div>
      <ThemeDialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen} />
    </nav>
  );
} 