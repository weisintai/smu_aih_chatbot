import React from "react";

interface UserAvatarProps {
  className?: string;
  size?: number;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
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
      <circle cx="100" cy="100" r="100" fill="#94A3B8" />

      {/* User figure group */}
      <g transform="translate(0, 5)">
        {/* Body/Shoulders */}
        <path
          d="M100 140 C60 140 55 110 55 110 C55 80 75 75 100 75 C125 75 145 80 145 110 C145 110 140 140 100 140"
          fill="#FFFFFF"
        />

        {/* Head */}
        <circle cx="100" cy="70" r="30" fill="#FFFFFF" />

        {/* Hair */}
        <path
          d="M70 70 C70 45 130 45 130 70 C130 45 70 45 70 70"
          fill="#2A2F38"
        />

        {/* Face elements group */}
        <g transform="translate(0, -2)">
          {/* Eyes */}
          <circle cx="87" cy="70" r="3" fill="#2A2F38" />
          <circle cx="113" cy="70" r="3" fill="#2A2F38" />

          {/* Smile */}
          <path
            d="M90 80 Q100 85 110 80"
            stroke="#2A2F38"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
};
