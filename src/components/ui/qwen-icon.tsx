import * as React from "react";

interface QwenIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const QwenIcon: React.FC<QwenIconProps> = ({ size = 24, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect width="24" height="24" rx="4" fill="#6366F1" />
    <text
      x="12"
      y="16"
      textAnchor="middle"
      fill="white"
      fontSize="10"
      fontWeight="bold"
      fontFamily="system-ui, sans-serif"
    >
      Q
    </text>
  </svg>
);

export default QwenIcon;
