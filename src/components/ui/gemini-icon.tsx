import React from "react";
import { cn } from "@/lib/utils";

interface GeminiIconProps {
  className?: string;
  size?: number;
}

export function GeminiIcon({ className, size = 16 }: GeminiIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("", className)}
    >
      <defs>
        <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#4285F4", stopOpacity: 1 }} />
          <stop offset="33%" style={{ stopColor: "#EA4335", stopOpacity: 1 }} />
          <stop offset="66%" style={{ stopColor: "#FBBC04", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#34A853", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <path
        d="M12 2L4 6v12l8 4 8-4V6l-8-4z"
        fill="url(#gemini-gradient)"
        opacity="0.9"
      />
      <circle cx="12" cy="8" r="2" fill="white" />
      <circle cx="8" cy="14" r="1.5" fill="white" />
      <circle cx="16" cy="14" r="1.5" fill="white" />
      <circle cx="12" cy="17" r="1.5" fill="white" />
    </svg>
  );
}
