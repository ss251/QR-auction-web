import React from "react";
import { useBaseColors } from "@/hooks/useBaseColors";

interface UniswapWidgetProps {
  className?: string;
  inputCurrency?: string;
  outputCurrency?: string;
}

export function UniswapWidget({
  className = "",
  inputCurrency = "NATIVE",
  outputCurrency = "0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF", // QR token address
}: UniswapWidgetProps) {
  const isBaseColors = useBaseColors();

  // Build the Uniswap iframe URL with input and output currencies
  const uniswapUrl = `https://app.uniswap.org/swap?inputCurrency=${inputCurrency}&outputCurrency=${outputCurrency}&chain=base&exactField=output&exactAmount=1000000`;

  return (
    <div className={`h-full w-full rounded-lg overflow-hidden border ${isBaseColors ? "border-primary/20" : "light:border-gray-200"} ${className}`} style={{ height: '100%' }}>
      <iframe
        src={uniswapUrl}
        height="100%"
        width="100%"
        style={{
          border: 0,
          margin: 0,
          display: 'block',
          borderRadius: '10px',
          height: '100%',
        }}
        title="Uniswap Widget"
        allow="clipboard-write"
        tabIndex={-1}
        loading="lazy"
      />
    </div>
  );
} 