import type { LegalDocumentType } from "@/generated/prisma/enums";

/** Rascunhos para o MASTER editar. Não são texto jurídico; os marcadores impedem a publicação sem edição. */
export const LEGAL_TEMPLATES: Record<LegalDocumentType, string> = {
  TERMS: `Termos de uso — Rascunho, revisar com assessoria jurídica antes de publicar

1. Quem somos
O BeeDock é operado por [PREENCHER: razão social da plataforma], CNPJ [PREENCHER: CNPJ], com sede em [PREENCHER: cidade/UF] ("BeeDock").

2. O serviço
O BeeDock é um sistema de gestão online para estamparias: lançamentos de entradas e saídas, recibos, cadastro de clientes, pedidos com recebimentos e relatórios. Cada empresa usuária enxerga apenas os próprios dados.

3. Conta e acesso
O acesso é pessoal e intransferível, liberado por convite. Você é responsável por manter sua senha em sigilo e por tudo que for feito com a sua conta. Avise o suporte se suspeitar de uso indevido. O acesso pode ser bloqueado temporariamente após várias tentativas de login erradas.

4. Responsabilidades da empresa usuária
A empresa é responsável pela veracidade dos dados lançados, pelo uso conforme a lei e por ter base legal para tratar os dados dos próprios clientes, sendo ela a controladora desses dados e o BeeDock a operadora. Não é permitido usar o serviço para fins ilícitos, tentar acessar dados de outra empresa ou comprometer a segurança da plataforma.

5. Registros de auditoria
Toda alteração feita no sistema é registrada (quem, o quê e quando) em um histórico que não pode ser editado nem apagado. Isso protege a empresa e o BeeDock e faz parte do serviço.

6. Disponibilidade e suporte
Trabalhamos para manter o serviço disponível, mas ele pode ficar indisponível por manutenção ou por falhas de terceiros. Suporte: [PREENCHER: canal de suporte e prazos de atendimento].

7. Preço e pagamento
[PREENCHER: condições comerciais do piloto/plano, ou "sem cobrança durante o piloto"].

8. Encerramento
A empresa pode pedir o encerramento a qualquer momento. O BeeDock pode suspender ou encerrar contas em caso de descumprimento destes termos ou de uso que ameace a segurança. Ao encerrar, a empresa pode pedir a exportação dos seus dados; o histórico de auditoria é mantido pelo prazo legal.

9. Alterações destes termos
Podemos atualizar estes termos. Quando houver nova versão, o sistema pede um novo aceite no próximo acesso.

10. Foro
Estes termos seguem a lei brasileira. Fica eleito o foro de [PREENCHER: comarca/UF] para resolver disputas.
`,
  PRIVACY: `Política de privacidade — Rascunho, revisar com assessoria jurídica antes de publicar

1. Controlador e operador
Sobre os dados de acesso dos usuários, o controlador é [PREENCHER: razão social da plataforma], CNPJ [PREENCHER: CNPJ]. Sobre os dados de clientes e lançamentos de cada empresa, a empresa é a controladora e o BeeDock é operador.

2. Encarregado (DPO)
[PREENCHER: nome e e-mail de contato do encarregado]

3. Dados tratados
- Usuários: nome, e-mail, senha (guardada só como hash), papel na empresa, IP e navegador usados nos acessos e nos aceites.
- Empresa: razão social, documento, endereço, logo e configurações.
- Clientes da empresa: nome, WhatsApp, e-mail, documento, endereço, pedidos, lançamentos e comprovantes enviados pela empresa.

4. Finalidades e bases legais
Executar o contrato e prestar o serviço, cumprir obrigação legal e regulatória, e garantir a segurança e a prevenção a fraudes (registro de acessos e auditoria). Não vendemos dados nem os usamos para publicidade.

5. Compartilhamento
Usamos provedores de infraestrutura como operadores: hospedagem da aplicação, banco de dados e armazenamento de arquivos. Eles só tratam os dados para prestar o serviço ao BeeDock. Podemos compartilhar dados com autoridades quando a lei exigir.

6. Armazenamento e retenção
Os dados ficam em servidores em [PREENCHER: região dos dados, ex.: Estados Unidos], com transferência internacional amparada na LGPD. Mantemos os dados enquanto a conta existir e pelo prazo necessário depois disso: [PREENCHER: prazo de retenção após o encerramento].
Os registros de auditoria (quem fez o quê e quando) são imutáveis por desenho e ficam guardados por 5 anos por obrigação legal. Eles podem conter o nome do titular e o contato mascarado, mesmo depois da anonimização do cadastro do cliente.

7. Segurança
Isolamos os dados de cada empresa no banco, guardamos senhas com hash, usamos conexão criptografada, mantemos comprovantes em armazenamento privado e registramos as alterações em uma cadeia de auditoria à prova de adulteração.

8. Direitos do titular
Você pode pedir confirmação do tratamento, acesso, correção, anonimização ou eliminação, portabilidade, informação sobre compartilhamento e revogação de consentimento, pelo contato do encarregado. Para dados de clientes de uma empresa, o pedido pode ser feito à própria empresa. A eliminação é feita pela anonimização do cadastro: nome, WhatsApp, e-mail, documento e endereço são apagados, inclusive dos lançamentos dos pedidos do cliente.

9. Cookies
Usamos apenas cookies essenciais de sessão para manter você conectado.

10. Alterações
Podemos atualizar esta política. Quando houver nova versão, o sistema pede um novo aceite no próximo acesso.
`,
};
