export type IntegrationProviderId = "GoogleCalendar" | "Microsoft365Calendar";

export type IntegrationProviderDefinition = {
  id: IntegrationProviderId;
  slug: "google-calendar" | "microsoft-365-calendar";
  label: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
  requiredCalendarScope: string;
  responseMode?: "query";
  clientIdVariable: string;
  clientSecretVariable: string;
};

export const INTEGRATION_PROVIDERS: IntegrationProviderDefinition[] = [
  {
    id: "GoogleCalendar",
    slug: "google-calendar",
    label: "Google Calendar",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
    requiredCalendarScope: "https://www.googleapis.com/auth/calendar.events",
    clientIdVariable: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretVariable: "GOOGLE_OAUTH_CLIENT_SECRET",
  },
  {
    id: "Microsoft365Calendar",
    slug: "microsoft-365-calendar",
    label: "Microsoft 365 Calendar",
    authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoEndpoint: "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName",
    scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.ReadWrite"],
    requiredCalendarScope: "Calendars.ReadWrite",
    responseMode: "query",
    clientIdVariable: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretVariable: "MICROSOFT_OAUTH_CLIENT_SECRET",
  },
];

export function integrationProvider(slug: string) {
  return INTEGRATION_PROVIDERS.find((provider) => provider.slug === slug) ?? null;
}

export function integrationCredentialsConfigured(
  provider: IntegrationProviderDefinition,
  environment: Record<string, string | undefined> = process.env,
) {
  return Boolean(environment[provider.clientIdVariable]?.trim() && environment[provider.clientSecretVariable]?.trim());
}

export function integrationEncryptionConfigured(environment: Record<string, string | undefined> = process.env) {
  return /^[\da-f]{64}$/i.test(environment.SENSITIVE_DATA_ENCRYPTION_KEY ?? "");
}

export function integrationReady(
  provider: IntegrationProviderDefinition,
  environment: Record<string, string | undefined> = process.env,
) {
  return integrationCredentialsConfigured(provider, environment) && integrationEncryptionConfigured(environment);
}

export function normalizedOAuthEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function buildOAuthAuthorizationUrl(
  provider: IntegrationProviderDefinition,
  options: { clientId: string; redirectUri: string; state: string; codeChallenge: string },
) {
  const authorizationUrl = new URL(provider.authorizationEndpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    ...(provider.responseMode ? { response_mode: provider.responseMode } : {}),
    scope: provider.scopes.join(" "),
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    ...(provider.id === "GoogleCalendar" ? { access_type: "offline", prompt: "consent" } : {}),
  }).toString();
  return authorizationUrl;
}

export function oauthAccountEmail(provider: IntegrationProviderDefinition, identity: unknown) {
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) return null;
  const record = identity as Record<string, unknown>;
  if (provider.id === "GoogleCalendar" && record.email_verified !== true) return null;
  return normalizedOAuthEmail(provider.id === "GoogleCalendar" ? record.email : record.mail ?? record.userPrincipalName);
}

export function parseOAuthTokenResponse(payload: unknown, requiredScope: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const scopes = typeof record.scope === "string" ? record.scope.split(/\s+/).filter(Boolean) : [];
  if (
    typeof record.access_token !== "string"
    || !record.access_token
    || record.token_type !== "Bearer"
    || !scopes.includes(requiredScope)
  ) return null;
  const refreshToken = typeof record.refresh_token === "string" && record.refresh_token ? record.refresh_token : null;
  const expiresIn = typeof record.expires_in === "number" && Number.isFinite(record.expires_in) && record.expires_in > 0
    ? record.expires_in
    : null;
  return { accessToken: record.access_token, refreshToken, scopes, expiresIn };
}
