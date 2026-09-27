export const ACCOUNT_ACCESS_TOKEN_KEY = "interactive-story:account-access-token";

export function getAccountAccessToken() {
  if (typeof window === "undefined") return null;
  const token = window.sessionStorage.getItem(ACCOUNT_ACCESS_TOKEN_KEY)?.trim();
  return token || null;
}
