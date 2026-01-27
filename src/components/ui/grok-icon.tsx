import React from "react";
import { cn } from "@/lib/utils";
import grokLogo from "@/assets/grok-logo.png";

interface GrokIconProps {
  className?: string;
  size?: number;
}

export function GrokIcon({ className, size = 24 }: GrokIconProps) {
  return (
    <img
      src={grokLogo}
      alt="Grok"
      width={size}
      height={size}
      className={cn("object-contain dark:invert-0 invert", className)}
    />
  );
}

export default GrokIcon;
