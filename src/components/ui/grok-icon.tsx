import * as React from "react";

interface GrokIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const GrokIcon: React.FC<GrokIconProps> = ({ size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect width="24" height="24" rx="4" fill="#000000" />
    <path
      d="M6 12L10 8L14 12L18 8"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 16L10 12L14 16L18 12"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default GrokIcon;
