import './stylesheet.scss';
import React from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ResetConversationButtonProps {
  onReset: () => void;
  isPending: boolean;
}

export const ResetConversationButton: React.FC<
  ResetConversationButtonProps
> = ({ onReset, isPending }) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <div className='buttonWrapper'>
          <Button
            variant="ghost"
            size="sm"
            className="self-center resetButton"
            disabled={isPending}
          >
            Reset conversation
          </Button>
        </div>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onReset}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
