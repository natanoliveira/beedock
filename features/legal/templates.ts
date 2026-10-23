import type { LegalDocumentType } from "@/generated/prisma/enums";

/** Rascunhos para o MASTER editar. Não são texto jurídico; os marcadores impedem a publicação sem edição. */
export const LEGAL_TEMPLATES: Record<LegalDocumentType, string> = {
  TERMS: `Termos de uso — Modelo de rascunho, revisar com assessoria jurídica

1. Quem somos
[PREENCHER: razão social da plataforma], CNPJ [PREENCHER: CNPJ], responsável pela plataforma BeeDock.

2. O serviço
Descreva o que a plataforma oferece e para quem.

3. Conta e acesso
Regras de cadastro, senha, uso pessoal e responsabilidade pelas credenciais.

4. Responsabilidades da empresa usuária
Veracidade dos dados lançados e uso conforme a lei.

5. Disponibilidade e suporte
[PREENCHER: canal de suporte e prazos]

6. Encerramento
Condições de suspensão e cancelamento.

7. Foro
[PREENCHER: foro e legislação aplicável]
`,
  PRIVACY: `Política de privacidade — Modelo de rascunho, revisar com assessoria jurídica

1. Controlador
[PREENCHER: razão social da plataforma], CNPJ [PREENCHER: CNPJ].

2. Encarregado (DPO)
[PREENCHER: contato do encarregado]

3. Dados tratados
Dados de acesso, de cadastro da empresa e dos clientes lançados pela empresa.

4. Finalidades e bases legais
Execução do contrato, obrigação legal e segurança.

5. Compartilhamento
Operadores e provedores de infraestrutura.

6. Armazenamento
[PREENCHER: região dos dados] e prazos de retenção.

7. Direitos do titular
Acesso, correção, eliminação e demais direitos da LGPD, pelo contato do encarregado.
`,
};
