export interface Message {
  role: "user" | "assistant";
  content: string;
  fileName?: string;
  referenceMessage?: string;
}

export interface DetectIntentResponse {
  queryResult: {
    responseMessages: Array<{
      text?: {
        text: string[];
      };
    }>;
  };
}

export interface UseDetectIntentResult {
  mutate: (
    data: { query: string; file?: File },
    options?: {
      onSuccess?: (response: DetectIntentResponse) => void;
      onError?: (error: unknown) => void;
    }
  ) => void;
  isPending: boolean;
}

export interface UseToastResult {
  toast: (props: {
    title: string;
    description: string;
    variant?: "default" | "destructive";
  }) => void;
}
