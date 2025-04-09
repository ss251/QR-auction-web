import { UserPill as PrivyUserPill } from "@privy-io/react-auth/ui";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import clsx from "clsx";

type QRUserPillProps = {
  size?: number;
  className?: string;
};

export function QRUserPill({ size = 40, className = "" }: QRUserPillProps) {
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  // Once mounted, we can safely show the UserPill (prevents hydration issues)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Create a placeholder with the right dimensions
  const placeholderClassName = clsx(
    className,
    `h-${Math.floor(size/4)} w-${Math.floor(size/4)} rounded-full bg-muted`
  );

  if (!mounted) {
    return <div className={placeholderClassName} />;
  }

  // Set theme-specific pill appearance
  const pillAppearance = {
    theme: theme === "light" ? "dark" : "light",
    ...(theme === "dark" ? {
      colors: {
        accent: "#FFFFFF",
        accentText: "#000000",
        profileBackground: "#FFFFFF",
        profileBorder: "#FFFFFF",
        profileText: "#000000"
      }
    } : {})
  };

  return (
    <div className={className}>
      <PrivyUserPill
        action={{ type: "login" }}
        size={size}
        appearance={pillAppearance}
      />
    </div>
  );
} 