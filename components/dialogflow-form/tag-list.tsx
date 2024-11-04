import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  ShieldCheck,
  CircleHelp,
  Landmark,
  LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const tags = [
  {
    icon: Wallet,
    label: "Money Management",
    color: "#059669",
    questions: [
      "How much of my salary should I save each month?",
      "How to send money home safely and cheaply?",
      "What are the best ways to track my daily expenses?",
      "How to save for emergencies?",
    ],
  },
  {
    icon: ShieldCheck,
    label: "Scam Protection",
    color: "#DC2626",
    questions: [
      "How to spot common scams targeting workers?",
      "What to do if someone asks for my bank details?",
      "Where to report if I've been scammed?",
      "Should I give my bank account number and password to MOM or police?",
    ],
  },
  {
    icon: Landmark,
    label: "Banking Help",
    color: "#2563EB",
    questions: [
      "How to remit money online?",
      "How to update my information in the digibank app?",
      "How to apply for card replacement online? ",
      "How to log in digibank app if I forgot the password?",
    ],
  },
  {
    icon: CircleHelp,
    label: "Quick Help",
    color: "#9333EA",
    questions: [
      "Who to call in an emergency?",
      "What are my basic worker rights?",
      "How to contact MOM for help?",
    ],
  },
];

interface TagProps {
  icon: LucideIcon;
  label: string;
  color?: string;
  questions: string[];
  onQuestionSelect: (question: string) => void;
}

const Tag = ({
  icon: Icon,
  label,
  color,
  questions,
  onQuestionSelect,
}: TagProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="relative flex h-[42px] items-center gap-1.5 rounded-full border border-token-border-light px-3 py-2 text-start text-[13px] shadow-xxs transition enabled:hover:bg-token-main-surface-secondary disabled:cursor-not-allowed xl:gap-2 xl:text-[14px]"
        >
          <Icon className="w-4 h-4" color={color} />
          <span>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="center">
        <div className="rounded-lg divide-y divide-border shadow-xl">
          {questions.map((question, index) => (
            <button
              key={index}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors text-sm"
              onClick={() => {
                onQuestionSelect(question);
                setOpen(false);
              }}
            >
              {question}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface TagListProps {
  onQuestionSelect: (question: string) => void;
}

const TagList = ({ onQuestionSelect }: TagListProps) => {
  return (
    <div className="flex flex-wrap gap-2 items-center justify-center">
      {tags.map((tag) => (
        <Tag
          key={tag.label}
          icon={tag.icon}
          label={tag.label}
          color={tag.color}
          questions={tag.questions}
          onQuestionSelect={onQuestionSelect}
        />
      ))}
    </div>
  );
};

export default TagList;
