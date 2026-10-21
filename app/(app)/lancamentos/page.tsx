import type { Metadata } from "next";
import { EmptyState } from "@/components/molecules/EmptyState";

export const metadata: Metadata = { title: "Lançamentos" };

export default function Page() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-extrabold md:text-3xl">Lançamentos</h1>
      <EmptyState title="Em construção" description="Esta tela chega na Fase 3." />
    </div>
  );
}
