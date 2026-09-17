export const OAUTH_POPUP_MESSAGE_TYPE = "coditent:oauth:complete";
export const OAUTH_POPUP_ACK_TYPE = "coditent:oauth:ack";

export type OAuthPopupResult =
  | {
      type: typeof OAUTH_POPUP_MESSAGE_TYPE;
      status: "success";
      token: string;
      isNewRegistration: boolean;
    }
  | {
      type: typeof OAUTH_POPUP_MESSAGE_TYPE;
      status: "error";
      error: string;
    };

export const OAUTH_POPUP_ACK = { type: OAUTH_POPUP_ACK_TYPE } as const;

export function isOAuthPopupResult(value: unknown): value is OAuthPopupResult {
  if (!value || typeof value !== "object") return false;

  const message = value as Record<string, unknown>;
  if (message.type !== OAUTH_POPUP_MESSAGE_TYPE) return false;

  if (message.status === "success") {
    return (
      typeof message.token === "string" &&
      message.token.length > 0 &&
      typeof message.isNewRegistration === "boolean"
    );
  }

  return message.status === "error" && typeof message.error === "string";
}

export function isOAuthPopupAck(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).type === OAUTH_POPUP_ACK_TYPE
  );
}
