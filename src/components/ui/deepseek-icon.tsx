import React from "react";
import { cn } from "@/lib/utils";
import deepseekLogo from "@/assets/deepseek-logo.png";

interface DeepseekIconProps {
  className?: string;
  size?: number;
}

export function DeepseekIcon({ className, size = 16 }: DeepseekIconProps) {
  // Triple the size to fill the frame like other icons
  const adjustedSize = size * 3;
  
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
