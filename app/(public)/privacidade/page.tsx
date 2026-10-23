import type { Metadata } from "next";
import { PublicLegalPage } from "../_components/PublicLegalPage";

export const metadata: Metadata = { title: "Política de Privacidade" };

export default function Page() {
  return <PublicLegalPage type="PRIVACY" title="Política de Privacidade" />;
}
