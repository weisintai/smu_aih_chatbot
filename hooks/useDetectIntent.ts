import { useMutation, UseMutationResult } from "@tanstack/react-query";
import ky from "ky";

interface RequestData {
  query: string;
  file?: File;
}

export interface DialogflowResponse {
  vertexAgentResponse: string;
  geminiResponse: string;
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
    .post("/api/detectIntent", { body: formData, timeout: false })
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
  });
};

export default useDetectIntent;
