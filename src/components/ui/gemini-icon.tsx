import React from "react";
import { cn } from "@/lib/utils";
import geminiLogo from "@/assets/gemini-logo.png";

interface GeminiIconProps {
  className?: string;
  size?: number;
}

export function GeminiIcon({ className, size = 16 }: GeminiIconProps) {
  return (
    <img
      src={geminiLogo}
      alt="Google Gemini"
      width={size}
      height={size}
      className={cn("object-contain", className)}
    />
  );
}
