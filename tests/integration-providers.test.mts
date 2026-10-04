import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOAuthAuthorizationUrl,
  integrationCredentialsConfigured,
  integrationEncryptionConfigured,
  integrationProvider,
  integrationReady,
  INTEGRATION_PROVIDERS,
  normalizedOAuthEmail,
  oauthAccountEmail,
  parseOAuthTokenResponse,
} from "../lib/integration-providers.ts";
import { hashToken } from "../lib/security.ts";

test("OAuth provider allowlist rejects unknown callback names", () => {
  assert.equal(integrationProvider("google-calendar")?.id, "GoogleCalendar");
  assert.equal(integrationProvider("microsoft-365-calendar")?.id, "Microsoft365Calendar");
  assert.equal(integrationProvider("other"), null);
});

test("OAuth connect readiness requires both server-only provider credentials", () => {
  const google = INTEGRATION_PROVIDERS[0];
  assert.equal(integrationCredentialsConfigured(google, {}), false);
  assert.equal(integrationCredentialsConfigured(google, { GOOGLE_OAUTH_CLIENT_ID: "id" }), false);
  assert.equal(integrationCredentialsConfigured(google, { GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "secret" }), true);
  assert.equal(integrationEncryptionConfigured({}), false);
  assert.equal(integrationEncryptionConfigured({ SENSITIVE_DATA_ENCRYPTION_KEY: "a".repeat(64) }), true);
  assert.equal(integrationEncryptionConfigured({ SENSITIVE_DATA_ENCRYPTION_KEY: "not-hex".repeat(8) }), false);
  assert.equal(integrationReady(google, {
    GOOGLE_OAUTH_CLIENT_ID: "id",
    GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    SENSITIVE_DATA_ENCRYPTION_KEY: "a".repeat(64),
  }), true);
});

test("OAuth account emails are validated and normalized before storage", () => {
  assert.equal(normalizedOAuthEmail("  User@Example.org "), "user@example.org");
  assert.equal(normalizedOAuthEmail("not-an-email"), null);
  assert.equal(normalizedOAuthEmail(null), null);
});

test("OAuth authorization URLs use allowlisted endpoints, callback, requested scope, state and PKCE", () => {
  const google = INTEGRATION_PROVIDERS[0];
  const url = buildOAuthAuthorizationUrl(google, {
    clientId: "public-client-id",
    redirectUri: "https://parlia.example/api/integrations/oauth/google-calendar/callback",
    state: "one-time-state",
    codeChallenge: "pkce-challenge",
  });
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://parlia.example/api/integrations/oauth/google-calendar/callback");
  assert.equal(url.searchParams.get("state"), "one-time-state");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("scope")?.includes(google.requiredCalendarScope));
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.match(hashToken("one-time-state"), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken("one-time-state"), "one-time-state");

  const microsoft = INTEGRATION_PROVIDERS[1];
  const microsoftUrl = buildOAuthAuthorizationUrl(microsoft, {
    clientId: "public-client-id",
    redirectUri: "https://parlia.example/api/integrations/oauth/microsoft-365-calendar/callback",
    state: "one-time-state",
    codeChallenge: "pkce-challenge",
  });
  assert.equal(microsoftUrl.origin, "https://login.microsoftonline.com");
  assert.equal(microsoftUrl.searchParams.get("response_mode"), "query");
  assert.ok(microsoftUrl.searchParams.get("scope")?.includes(microsoft.requiredCalendarScope));
});

test("OAuth token payloads are accepted only with Bearer access and granted calendar scope", () => {
  const google = INTEGRATION_PROVIDERS[0];
  const valid = {
    access_token: "access",
    refresh_token: "refresh",
    token_type: "Bearer",
    scope: `openid ${google.requiredCalendarScope}`,
    expires_in: 3600,
  };
  assert.deepEqual(parseOAuthTokenResponse(valid, google.requiredCalendarScope), {
    accessToken: "access",
    refreshToken: "refresh",
    scopes: ["openid", google.requiredCalendarScope],
    expiresIn: 3600,
  });
  assert.equal(parseOAuthTokenResponse({ ...valid, scope: "openid" }, google.requiredCalendarScope), null);
  assert.equal(parseOAuthTokenResponse({ ...valid, token_type: "MAC" }, google.requiredCalendarScope), null);
  assert.equal(parseOAuthTokenResponse("not-json", google.requiredCalendarScope), null);
});

test("OAuth account identity requires a verified Google email and accepts Microsoft account mail", () => {
  const google = INTEGRATION_PROVIDERS[0];
  const microsoft = INTEGRATION_PROVIDERS[1];
  assert.equal(oauthAccountEmail(google, { email: "person@example.org", email_verified: false }), null);
  assert.equal(oauthAccountEmail(google, { email: " Person@example.org ", email_verified: true }), "person@example.org");
  assert.equal(oauthAccountEmail(microsoft, { mail: "WORK@example.org", userPrincipalName: "ignored@example.org" }), "work@example.org");
});
