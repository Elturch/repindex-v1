import React from "react";
import { cn } from "@/lib/utils";

interface PerplexityIconProps {
  className?: string;
  size?: number;
}

export function PerplexityIcon({ className, size = 16 }: PerplexityIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("", className)}
    >
      <path
        d="M12 2L3 7v10l9 5 9-5V7l-9-5z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v10M7.5 9.5l9 5M16.5 9.5l-9 5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}