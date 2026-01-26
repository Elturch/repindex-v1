import React from "react";
import { cn } from "@/lib/utils";
import perplexityLogo from "@/assets/perplexity-logo.png";

interface PerplexityIconProps {
  className?: string;
  size?: number;
}

export function PerplexityIcon({ className, size = 24 }: PerplexityIconProps) {
  return (
    <img
      src={perplexityLogo}
      alt="Perplexity"
      width={size}
      height={size}
      className={cn("object-contain", className)}
    />
  );
}

export default PerplexityIcon;
