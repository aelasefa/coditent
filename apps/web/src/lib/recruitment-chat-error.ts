import axios from "axios";

export function recruitmentChatErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "The conversation could not be loaded. Please retry.";
  }
  if (error.response?.status === 403) {
    return "Access denied. Only the candidate and responsible hiring team for this application can participate.";
  }
  if (error.response?.status === 404) {
    return "This application conversation is no longer available.";
  }
  if (error.response?.status === 422) {
    return "This conversation link is invalid. Return to the inbox and open it again.";
  }
  return "The conversation service is temporarily unavailable. Please retry.";
}
