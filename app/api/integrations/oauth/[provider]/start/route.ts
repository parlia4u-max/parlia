import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { encryptSensitive } from "@/lib/sensitive-data";
import { appUrl } from "@/lib/email";
import { hashToken, randomToken } from "@/lib/security";
import { buildOAuthAuthorizationUrl, integrationProvider, integrationReady } from "@/lib/integration-providers";

const STATE_COOKIE = "parlia_oauth_state";

export async function GET(_request: Request, context: RouteContext<"/api/integrations/oauth/[provider]/start">) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { provider: slug } = await context.params;
  const provider = integrationProvider(slug);
  if (!provider) return NextResponse.json({ error: "Integration provider not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!session.isOwner) return NextResponse.json({ error: "Only the firm owner can connect integrations." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!integrationReady(provider)) {
    return NextResponse.json({ error: "This provider is not ready. Configure its client ID and secret and the sensitive-data encryption key in the server environment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const clientId = process.env[provider.clientIdVariable]?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "This provider is not ready. Configure its client ID and secret and the sensitive-data encryption key in the server environment." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const redirectUri = appUrl(`/api/integrations/oauth/${provider.slug}/callback`);
  const user = await getDb().user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true, isOwner: true },
    select: { id: true, firmId: true },
  });
  if (!user) return NextResponse.json({ error: "Owner account is no longer active." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const state = randomToken();
  const verifier = randomToken();
  const sealedVerifier = encryptSensitive(verifier);
  const now = new Date();
  const db = getDb();
  await db.$transaction(async (tx) => {
    await tx.integrationOAuthState.deleteMany({ where: { firmId: user.firmId, expiresAt: { lte: now } } });
    await tx.integrationOAuthState.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        provider: provider.id,
        stateHash: hashToken(state),
        encryptedCodeVerifier: sealedVerifier.ciphertext,
        verifierIv: sealedVerifier.iv,
        verifierAuthTag: sealedVerifier.authTag,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });
  });

  const authorizationUrl = buildOAuthAuthorizationUrl(provider, {
    clientId,
    redirectUri,
    state,
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, hashToken(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/oauth",
    maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
