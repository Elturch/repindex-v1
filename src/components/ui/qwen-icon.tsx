import React from "react";
import { cn } from "@/lib/utils";
import qwenLogo from "@/assets/qwen-logo.png";

interface QwenIconProps {
  className?: string;
  size?: number;
}

export function QwenIcon({ className, size = 24 }: QwenIconProps) {
  return (
    <img
      src={qwenLogo}
      alt="Qwen"
      width={size}
      height={size}
      className={cn("object-contain", className)}
    />
  );
}

export default QwenIcon;
