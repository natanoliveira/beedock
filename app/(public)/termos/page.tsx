import type { Metadata } from "next";
import { PublicLegalPage } from "../_components/PublicLegalPage";

export const metadata: Metadata = { title: "Termos de Uso" };

export default function Page() {
  return <PublicLegalPage type="TERMS" title="Termos de Uso" />;
}
