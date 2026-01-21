import * as React from "react";

interface ClaudeIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const ClaudeIcon: React.FC<ClaudeIconProps> = ({ size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect width="24" height="24" rx="4" fill="#CC785C" />
    <path
      d="M15.5 7.5L12 15L8.5 7.5"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 12H17"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export default ClaudeIcon;
