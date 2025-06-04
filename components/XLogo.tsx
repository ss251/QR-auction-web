import React from 'react';
import { cn } from '@/lib/utils';

interface XLogoProps {
  size?: 'sm' | 'md' | 'lg';
  username?: string;
  className?: string;
}

export function XLogo({ size = 'md', username, className }: XLogoProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4', 
    lg: 'h-5 w-5'
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (username) {
      window.open(`https://x.com/${username}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={cn(
        "relative inline-block cursor-pointer transition-opacity hover:opacity-80",
        className
      )}
      onClick={handleClick}
      title={username ? `@${username} on X` : 'X (Twitter)'}
    >
      {/* Light mode X logo (black) */}
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/X_logo.jpg/1200px-X_logo.jpg"
        alt="X"
        className={cn(
          sizeClasses[size],
          "block dark:hidden"
        )}
      />
      
      {/* Dark mode X logo (white) */}
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/X_logo.jpg/1200px-X_logo.jpg"
        alt="X"
        className={cn(
          sizeClasses[size],
          "hidden dark:block"
        )}
      />
    </div>
  );
}
