export const OAUTH_POPUP_SUCCESS = "CODITENT_OAUTH_SUCCESS";
export const OAUTH_POPUP_ERROR = "CODITENT_OAUTH_ERROR";
export const OAUTH_POPUP_ACK = "CODITENT_OAUTH_ACK";

export type OAuthPopupResult =
  | {
      type: typeof OAUTH_POPUP_SUCCESS;
      attemptId: string;
      handoffCode: string;
      isNewRegistration: boolean;
    }
  | {
      type: typeof OAUTH_POPUP_ERROR;
      attemptId: string;
      error: string;
    };

export type OAuthPopupAck = { type: typeof OAUTH_POPUP_ACK; attemptId: string };

export function oauthChannelName(attemptId: string): string {
  return `coditent:oauth:${attemptId}`;
}

export function isOAuthPopupResult(value: unknown): value is OAuthPopupResult {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;
  if (typeof message.attemptId !== "string" || !message.attemptId) return false;
  if (message.type === OAUTH_POPUP_SUCCESS) {
    return (
      typeof message.handoffCode === "string" &&
      message.handoffCode.length >= 20 &&
      typeof message.isNewRegistration === "boolean"
    );
  }

  return message.type === OAUTH_POPUP_ERROR && typeof message.error === "string";
}

export function isOAuthPopupAck(value: unknown, attemptId: string): value is OAuthPopupAck {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).type === OAUTH_POPUP_ACK &&
      (value as Record<string, unknown>).attemptId === attemptId
  );
}
