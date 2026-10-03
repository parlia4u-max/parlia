"use client";
import { ModuleEError } from "@/components/module-e-states";
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <ModuleEError reset={reset} />; }
