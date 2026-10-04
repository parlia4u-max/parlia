import { HrProfile } from "@/components/hr-profile";

export default async function StaffHRPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <HrProfile targetId={userId} />;
}
