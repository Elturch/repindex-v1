import React from "react";
import { cn } from "@/lib/utils";
import deepseekLogo from "@/assets/deepseek-logo.png";

interface DeepseekIconProps {
  className?: string;
  size?: number;
}

export function DeepseekIcon({ className, size = 16 }: DeepseekIconProps) {
  // Increase size by 50% to match other icons' visual weight
  const adjustedSize = Math.round(size * 1.5);
  
  return (
    <img
      src={deepseekLogo}
      alt="Deepseek"
      width={adjustedSize}
      height={adjustedSize}
      className={cn("object-contain", className)}
    />
  );
}
