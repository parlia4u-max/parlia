import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { decryptSensitive, encryptSensitive } from "@/lib/sensitive-data";
import { hashToken } from "@/lib/security";
import { integrationEncryptionConfigured, integrationProvider, oauthAccountEmail, parseOAuthTokenResponse } from "@/lib/integration-providers";

const STATE_COOKIE = "parlia_oauth_state";
const COOKIE_PATH = "/api/integrations/oauth";

class OAuthFlowError extends Error {
  constructor(readonly stage: string, message: string) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function settingsRedirect(result: "connected" | "cancelled" | "failed") {
  const response = NextResponse.redirect(new URL(`/settings/integrations?integration=${result}`, appUrl("/")));
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function providerRequest(url: string, init: RequestInit, stage: string) {
  try {
    return await fetch(url, init);
  } catch {
    throw new OAuthFlowError(stage, "Provider could not be reached.");
  }
}

async function responseObject(response: Response, stage: string) {
  if (!response.ok) throw new OAuthFlowError(stage, "Provider rejected the authorization.");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthFlowError(stage, "Provider returned an invalid response.");
  }
  if (!isObject(payload)) throw new OAuthFlowError(stage, "Provider returned an invalid response.");
  return payload;
}

export async function GET(request: Request, context: RouteContext<"/api/integrations/oauth/[provider]/callback">) {
  const { provider: slug } = await context.params;
  const provider = integrationProvider(slug);
  if (!provider) return settingsRedirect("failed");
  const parameters = new URL(request.url).searchParams;
  const state = parameters.get("state");
  const code = parameters.get("code");
  const jar = await cookies();
  const browserState = jar.get(STATE_COOKIE)?.value;
  if (!state || state.length > 200 || browserState !== hashToken(state)) return settingsRedirect("failed");
  const db = getDb();
  const challenge = await db.integrationOAuthState.findFirst({
    where: { stateHash: hashToken(state), provider: provider.id, usedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      firmId: true,
      userId: true,
      stateHash: true,
      encryptedCodeVerifier: true,
      verifierIv: true,
      verifierAuthTag: true,
    },
  });
  if (!challenge) return settingsRedirect("failed");
  const owner = await db.user.findFirst({
    where: { id: challenge.userId, firmId: challenge.firmId, active: true, isOwner: true },
    select: { id: true },
  });
  if (!owner) return settingsRedirect("failed");
  const consumed = await db.integrationOAuthState.updateMany({
    where: { id: challenge.id, firmId: challenge.firmId, stateHash: hashToken(state), provider: provider.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) return settingsRedirect("failed");
  if (parameters.has("error")) {
    await db.auditLog.create({
      data: { firmId: challenge.firmId, actorId: owner.id, action: "integration.oauth_cancelled", entityType: "integration", details: { provider: provider.id } },
    });
    return settingsRedirect("cancelled");
  }
  if (!code || code.length > 4096) {
    await db.auditLog.create({
      data: { firmId: challenge.firmId, actorId: owner.id, action: "integration.oauth_failed", entityType: "integration", details: { provider: provider.id, stage: "callback_validation" } },
    });
    return settingsRedirect("failed");
  }

  try {
    const clientId = process.env[provider.clientIdVariable]?.trim();
    const clientSecret = process.env[provider.clientSecretVariable]?.trim();
    if (!clientId || !clientSecret) throw new OAuthFlowError("configuration", "Provider credentials are not configured.");
    if (!integrationEncryptionConfigured()) throw new OAuthFlowError("configuration", "Sensitive-data encryption is not configured.");
    const codeVerifier = decryptSensitive(challenge.encryptedCodeVerifier, challenge.verifierIv, challenge.verifierAuthTag);
    const redirectUri = appUrl(`/api/integrations/oauth/${provider.slug}/callback`);
    const tokenResponse = await providerRequest(provider.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        ...(provider.id === "Microsoft365Calendar" ? { scope: provider.scopes.join(" ") } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }, "token_exchange");
    const tokens = await responseObject(tokenResponse, "token_exchange");
    const parsedTokens = parseOAuthTokenResponse(tokens, provider.requiredCalendarScope);
    if (!parsedTokens) {
      throw new OAuthFlowError("token_exchange", "Provider authorization did not grant the required calendar access.");
    }
    const { accessToken, scopes: returnedScopes, expiresIn } = parsedTokens;
    let refreshToken = parsedTokens.refreshToken;

    const identityResponse = await providerRequest(provider.userInfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }, "account_verification");
    const identity = await responseObject(identityResponse, "account_verification");
    const email = oauthAccountEmail(provider, identity);
    if (!email) throw new OAuthFlowError("account_verification", "Provider account did not return a valid email address.");
    if (!refreshToken) {
      const previous = await db.integrationConnection.findUnique({
        where: { firmId_provider: { firmId: challenge.firmId, provider: provider.id } },
        select: { connectedEmail: true, encryptedTokens: true, tokensIv: true, tokensAuthTag: true },
      });
      if (previous?.connectedEmail === email) {
        const previousPayload: unknown = JSON.parse(decryptSensitive(previous.encryptedTokens, previous.tokensIv, previous.tokensAuthTag));
        if (isObject(previousPayload) && typeof previousPayload.refreshToken === "string") refreshToken = previousPayload.refreshToken;
      }
    }
    if (!refreshToken) throw new OAuthFlowError("token_exchange", "Provider did not return a refresh token. Restart authorization and grant offline access.");

    const sealedTokens = encryptSensitive(JSON.stringify({ accessToken, refreshToken, tokenType: "Bearer" }));
    await db.$transaction(async (tx) => {
      const connection = await tx.integrationConnection.upsert({
        where: { firmId_provider: { firmId: challenge.firmId, provider: provider.id } },
        create: {
          firmId: challenge.firmId,
          provider: provider.id,
          connectedEmail: email,
          encryptedTokens: sealedTokens.ciphertext,
          tokensIv: sealedTokens.iv,
          tokensAuthTag: sealedTokens.authTag,
          scopes: returnedScopes.join(" "),
          accessTokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
          connectedById: owner.id,
        },
        update: {
          connectedEmail: email,
          encryptedTokens: sealedTokens.ciphertext,
          tokensIv: sealedTokens.iv,
          tokensAuthTag: sealedTokens.authTag,
          scopes: returnedScopes.join(" "),
          accessTokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
          connectedById: owner.id,
          connectedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { firmId: challenge.firmId, actorId: owner.id, action: "integration.oauth_connected", entityType: "integration", entityId: connection.id, details: { provider: provider.id, email, scopes: returnedScopes } },
      });
    });
    return settingsRedirect("connected");
  } catch (error) {
    if (!(error instanceof OAuthFlowError)) throw error;
    await db.auditLog.create({
      data: { firmId: challenge.firmId, actorId: owner.id, action: "integration.oauth_failed", entityType: "integration", details: { provider: provider.id, stage: error.stage } },
    });
    return settingsRedirect("failed");
  }
}
