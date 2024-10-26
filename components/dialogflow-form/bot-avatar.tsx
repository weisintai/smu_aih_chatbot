import React from "react";

interface BotAvatarProps {
  className?: string;
  size?: number;
}

export const BotAvatar: React.FC<BotAvatarProps> = ({
  className = "",
  size = 32,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`${className} h-full w-full`}
      style={{
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
      }}
    >
      {/* Background circle */}
      <circle cx="100" cy="100" r="100" fill="#89B5C8" />

      {/* Robot group - all robot elements grouped together for easier positioning */}
      <g transform="translate(0, 25)">
        {/* Headphones/Ears */}
        <ellipse cx="55" cy="90" rx="12" ry="15" fill="#FFFFFF" />
        <ellipse cx="145" cy="90" rx="12" ry="15" fill="#FFFFFF" />

        {/* Main head shape */}
        <rect x="60" y="55" width="80" height="70" rx="35" fill="#FFFFFF" />

        {/* Antenna */}
        <rect x="95" y="35" width="10" height="20" fill="#FFFFFF" />
        <circle cx="100" cy="30" r="10" fill="#FFFFFF" />

        {/* Face screen */}
        <rect x="67" y="62" width="66" height="56" rx="28" fill="#2A2F38" />

        {/* Eyes */}
        <circle cx="85" cy="85" r="6" fill="#4FD1C5" />
        <circle cx="115" cy="85" r="6" fill="#4FD1C5" />

        {/* Smile */}
        <path
          d="M87 98 Q100 105 113 98"
          stroke="#4FD1C5"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
};
