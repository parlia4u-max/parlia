import Link from "next/link";
import { redirect } from "next/navigation";
import { FoundationHeader } from "@/components/foundation";
import { ClientTour } from "@/components/client-intro";
import { getCurrentClient } from "@/lib/client-auth";
import { getFirmPortalContext } from "@/lib/firm-portal";

export default async function HowItWorksPage() {
  const client = await getCurrentClient();
  if (!client) redirect("/client/login");
  const { settings } = await getFirmPortalContext(client.firmId);
  return (
    <section className="foundation-page">
      <FoundationHeader title="How it works" firm={client.firm.name} />
      <div className="work-actions"><Link className="button-secondary link-button" href="/client">My matters</Link></div>
      <section className="foundation-panel"><ClientTour videoUrl={settings.introVideoUrl} /></section>
    </section>
  );
}