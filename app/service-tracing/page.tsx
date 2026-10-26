import { redirect } from "next/navigation";

// Service & tracing now lives on the drafting (task) list.
export default function ServiceTracingPage() {
  redirect("/tasks");
}
