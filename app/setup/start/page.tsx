import Link from "next/link";
import { notFound } from "next/navigation";
import { FoundationHeader } from "@/components/foundation";
import { QuickSetupWizard } from "@/components/quick-setup-wizard";
import { getSetupPageContext } from "@/lib/setup";
import type { SetupConfig } from "@/lib/setup-config";
import { defaultAnswers, FIRM_TYPES, PRACTICE_PACKS, ROLE_PRESETS, SA_PROVINCES, URGENCY_PRESETS } from "@/lib/setup-presets";

export default async function GuidedSetupPage() {
  const { user, firm, config } = await getSetupPageContext();
  if (!user.isOwner) notFound();
  const draft = config.draft as SetupConfig;
  const initial = defaultAnswers(draft);
  if (!initial.firm.name) initial.firm.name = firm.name;
  return (
    <section className="foundation-page setup-page">
      <FoundationHeader title="Set up your firm" firm={firm.name} isOwner />
      <p className="foundation-intro">Five short steps, about five minutes. Parlia fills in South African defaults – you only change what is different for your firm. <Link href="/setup">Prefer to edit each setting yourself?</Link></p>
      <QuickSetupWizard
        initial={initial}
        packs={PRACTICE_PACKS}
        firmTypes={FIRM_TYPES.map((type) => ({ key: type.key, label: type.label, packs: type.packs }))}
        roles={ROLE_PRESETS.map((role) => ({ key: role.key, label: role.label, description: role.description }))}
        urgency={{ simple: [...URGENCY_PRESETS.simple], detailed: [...URGENCY_PRESETS.detailed] }}
        provinces={SA_PROVINCES}
        published={config.publishedAt !== null}
      />
    </section>
  );
}
