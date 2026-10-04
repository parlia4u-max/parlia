import { HrProfile } from "@/components/hr-profile";
import { getHrPageUser } from "@/lib/hr-data";

export default async function MyHRPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getHrPageUser();
  const { q = "" } = await searchParams;
  return <HrProfile targetId={user.id} showDirectory query={q.trim().slice(0, 120)} />;
}
