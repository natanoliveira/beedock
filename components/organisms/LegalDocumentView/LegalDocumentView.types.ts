export type LegalDocumentViewProps = {
  title: string;
  version: number;
  publishedAt: Date;
  content: string;
  /** Nova versão de um documento já aceito antes. */
  updated?: boolean;
  /** Limita a altura e rola dentro do bloco. */
  scroll?: boolean;
  /** Página própria do documento: título vira h1. */
  heading?: "h1" | "h2";
};
