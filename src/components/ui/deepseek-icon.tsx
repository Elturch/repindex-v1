import React from "react";
import { cn } from "@/lib/utils";
import deepseekLogo from "@/assets/deepseek-logo.png";

interface DeepseekIconProps {
  className?: string;
  size?: number;
}

export function DeepseekIcon({ className, size = 16 }: DeepseekIconProps) {
  // Use 4x multiplier since the logo has more whitespace than other icons
  const adjustedSize = size * 4;
  
  return (
    <img
      src={deepseekLogo}
      alt="Deepseek"
      width={adjustedSize}
      height={adjustedSize}
      className={cn("object-contain scale-110", className)}
    />
  );
}
