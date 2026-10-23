import type { LegalDocumentViewProps } from "@/components/organisms/LegalDocumentView/LegalDocumentView.types";

export type TermsAcceptFormState = { error?: string; fieldErrors?: Record<string, string> };

export type TermsAcceptFormProps = {
  documents: (LegalDocumentViewProps & { id: string })[];
  action: (state: TermsAcceptFormState, formData: FormData) => Promise<TermsAcceptFormState>;
  logoutAction: () => Promise<void>;
};
