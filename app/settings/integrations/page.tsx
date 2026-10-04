import { disconnectIntegration } from "@/app/actions/integrations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { integrationCredentialsConfigured, integrationEncryptionConfigured, INTEGRATION_PROVIDERS } from "@/lib/integration-providers";

const connectionResultMessages: Record<string, string> = {
  connected: "Calendar account connected. Calendar events are not synchronized by this connection alone.",
  cancelled: "The provider connection was cancelled.",
  failed: "The provider connection could not be completed. Check the OAuth configuration and registered callback URL, then try again.",
  disconnected: "The provider account has been disconnected.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ integration?: string }>;
}) {
  const owner = await requireOwner();
  const [{ integration: result }, connections] = await Promise.all([
    searchParams,
    getDb().integrationConnection.findMany({
      where: { firmId: owner.firmId },
      select: { id: true, provider: true, connectedEmail: true, scopes: true, connectedAt: true },
    }),
  ]);
  const connectionByProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  return (
    <section className="foundation-page">
      <FoundationHeader title="Calendar integrations" firm={owner.firm.name} isOwner />
      <p className="foundation-intro">Connect a firm-owned Google or Microsoft 365 calendar account. Connecting grants Parlia the listed calendar permissions; events are not synchronized yet.</p>
      {result && connectionResultMessages[result] ? <p className="foundation-notice" role="status">{connectionResultMessages[result]}</p> : null}
      <section className="foundation-panel">
        <h2>Provider connections</h2>
        <p>Only the firm owner can connect or disconnect these accounts. Access tokens are encrypted and never displayed. Disconnecting deletes Parlia’s stored tokens; remove Parlia’s consent separately in the provider account settings if you also want to revoke the provider grant. A connection does not read, create, or change calendar events.</p>
        <p><Link href="/settings/integrations/preferences">Edit integration preferences</Link></p>
        <div className="setup-checklist">
          {INTEGRATION_PROVIDERS.map((provider) => {
            const connection = connectionByProvider.get(provider.id);
            const providerCredentialsConfigured = integrationCredentialsConfigured(provider);
            const encryptionConfigured = integrationEncryptionConfigured();
            const configured = providerCredentialsConfigured && encryptionConfigured;
            const status = connection ? "Connected" : configured ? "Not connected" : "Not configured";
            return (
              <article className="integration-provider-row" key={provider.id}>
                <span>
                  <strong>{provider.label}</strong>
                  <small>{connection
                    ? `Connected account: ${connection.connectedEmail}. Connected ${connection.connectedAt.toLocaleString()}.`
                    : configured
                      ? "Provider credentials are configured; connect an account to continue."
                      : !providerCredentialsConfigured
                        ? `Add ${provider.clientIdVariable} and ${provider.clientSecretVariable} to the server environment.`
                        : "Set SENSITIVE_DATA_ENCRYPTION_KEY to a 32-byte hexadecimal value in the server environment."}</small>
                  <small>Requested permissions: {provider.scopes.join(", ")}</small>
                  {connection ? <small>Granted permissions: {connection.scopes}</small> : null}
                </span>
                <span className={`foundation-status${connection ? " is-active" : ""}`}>{status}</span>
                {connection ? (
                  <ActionForm
                    action={disconnectIntegration}
                    confirmationMessage={`Disconnect ${provider.label}? Parlia will delete its stored provider tokens. To revoke provider consent too, do that in the provider account settings.`}
                  >
                    <input type="hidden" name="provider" value={provider.id} />
                    <SubmitButton className="button-secondary">Disconnect</SubmitButton>
                  </ActionForm>
                ) : configured ? (
                  <a className="button-primary" href={`/api/integrations/oauth/${provider.slug}/start`}>Connect {provider.label}</a>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
