import { useMutation, UseMutationResult } from "@tanstack/react-query";
import ky from "ky";

interface RequestData {
  query: string;
  file?: File;
}

interface DialogflowResponse {
  responseId: string;
  queryResult: {
    text: string;
    languageCode: string;
    responseMessages: Array<{
      text: {
        text: string[];
      };
    }>;
    intentDetectionConfidence: number;
    diagnosticInfo: {
      "Session Id": string;
      "Response Id": string;
    };
    match: {
      matchType: string;
      confidence: number;
    };
    advancedSettings: {
      loggingSettings: Record<string, unknown>;
    };
  };
  responseType: string;
}

const detectIntent = async (
  requestData: RequestData
): Promise<DialogflowResponse> => {
  const formData = new FormData();

  formData.append("query", requestData.query);

  if (requestData.file) {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];

    if (!allowedTypes.includes(requestData.file.type)) {
      throw new Error(
        "Invalid file type. Only JPEG, PNG, and PDF files are allowed."
      );
    }
    formData.append("file", requestData.file);
  }

  const response = await ky
    .post("/api/detectIntent", { body: formData })
    .json();

  return response as DialogflowResponse;
};

const useDetectIntent = (): UseMutationResult<
  DialogflowResponse,
  Error,
  RequestData,
  unknown
> => {
  return useMutation({
    mutationFn: detectIntent,
    onSuccess: (data) => {
      // Handle successful response
      console.log("Intent detected:", data);
    },
    onError: (error) => {
      // Handle error
      console.error("Error detecting intent:", error);
    },
  });
};

export default useDetectIntent;
