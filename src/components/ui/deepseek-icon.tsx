import React from "react";
import { cn } from "@/lib/utils";
import deepseekLogo from "@/assets/deepseek-logo.png";

interface DeepseekIconProps {
  className?: string;
  size?: number;
}

export function DeepseekIcon({ className, size = 16 }: DeepseekIconProps) {
  return (
    <img
      src={deepseekLogo}
      alt="Deepseek"
      width={size}
      height={size}
      className={cn("object-contain", className)}
    />
  );
}
