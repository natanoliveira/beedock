import type { FormState } from "@/lib/form-state";

export type LegalPublisherProps = {
  type: "TERMS" | "PRIVACY";
  title: string;
  current: { version: number; publishedAt: Date } | null;
  acceptedCount: number;
  activeUsers: number;
  history: { version: number; publishedAt: Date }[];
  /** Texto vigente, ou o modelo quando não há versão. */
  initialContent: string;
  publishAction: (prev: FormState, fd: FormData) => Promise<FormState>;
};
