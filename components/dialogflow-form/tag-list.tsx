import React from "react";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  ShieldCheck,
  CircleHelp,
  Landmark,
  LucideIcon,
} from "lucide-react";

interface TagProps {
  icon: LucideIcon;
  label: string;
  color?: string;
  onClick: () => void;
}

const Tag = ({ icon: Icon, label, color, onClick }: TagProps) => {
  return (
    <Button
      variant="ghost"
      className="relative flex h-[42px] items-center gap-1.5 rounded-full border border-token-border-light px-3 py-2 text-start text-[13px] shadow-xxs transition enabled:hover:bg-token-main-surface-secondary disabled:cursor-not-allowed xl:gap-2 xl:text-[14px]"
      onClick={onClick}
    >
      <Icon className="w-4 h-4" color={color} />
      <span>{label}</span>
    </Button>
  );
};

const TagList = () => {
  const tags = [
    {
      icon: Wallet,
      label: "Money Management",
      color: "green",
      onClick: () => console.log("Money Management clicked"),
    },
    {
      icon: ShieldCheck,
      label: "Scam Protection",
      onClick: () => console.log("Scam Protection clicked"),
    },
    {
      icon: Landmark,
      label: "Banking Help",
      onClick: () => console.log("Banking Help clicked"),
    },
    {
      icon: CircleHelp,
      label: "Quick Questions",
      onClick: () => console.log("General clicked"),
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 items-center justify-center">
      {tags.map((tag) => (
        <Tag
          key={tag.label}
          icon={tag.icon}
          label={tag.label}
          color={tag.color}
          onClick={tag.onClick}
        />
      ))}
    </div>
  );
};

export default TagList;
