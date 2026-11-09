# Convite por e-mail — análise

## Objetivo
Enviar o link de convite (Admin pela plataforma; equipe pela empresa) por e-mail via Brevo, além do link copiável atual.

## Decisões
- D-01 Provedor: Brevo, API transacional v3 via `fetch` (sem SDK). Envs `BREVO_API_KEY`, `MAIL_FROM=no-reply@beedock.com.br`.
- D-02 Escopo: os dois fluxos de convite (plataforma → Admin; empresa/MASTER → Admin ou Funcionário), mesmo serviço de envio.
- D-03 Link copiável continua exibido junto com o envio.
- D-04 Falha no envio não desfaz o convite: tela avisa "e-mail não enviado, copie o link".
- D-05 Reenvio: gera token novo e invalida o anterior (só o hash SHA-256 é guardado; token antigo não é recuperável).
- D-06 Auditoria: evento `invite.email_sent` (e falha) na cadeia HMAC.
- D-07 Conteúdo: pt-BR, HTML simples; nome da empresa, papel, validade 48h, botão com o link.

## Regras de negócio
- RN-01 Convite só é enviado ao e-mail do próprio convite; destinatário não é editável no envio.
- RN-02 Token em claro existe só na criação/reenvio: vai no e-mail e no flash cookie (`invite-flash`, 5 min); nunca persistido nem logado.
- RN-03 Reenvio só para convite pendente (não aceito, não revogado); expirado também pode ser reenviado (renova 48h).
- RN-04 Permissão de reenviar = mesma de convidar (`assertCanManage`: Admin da empresa ou MASTER; plataforma: MASTER).
- RN-05 Envio fora da transação do banco (nunca segurar tx aberta numa chamada HTTP); convite e auditoria de criação já commitados antes.
- RN-06 Chave e remetente ausentes nas envs: envio vira no-op com aviso "e-mail não configurado" (dev sem Brevo continua funcionando com link copiável).
- RN-07 Auditoria não grava o corpo do e-mail nem o token.

## Fora de escopo
- Templates com marca, fila/retry (BullMQ), webhooks de entrega/bounce, e-mail de reset de senha, notificações outras.

## Casos de borda
- CB-01 Brevo retorna 4xx/5xx ou timeout → D-04; timeout curto (ex. 10 s).
- CB-02 Remetente/domínio não verificado no Brevo → mesmo tratamento de CB-01; erro visível ao operador.
- CB-03 E-mail já cadastrado como usuário → convite continua exigindo senha atual; o e-mail serve igual.
- CB-04 Reenvios em sequência rápida → limitar (ex. 1 por minuto por convite) para não gastar a cota (300/dia no plano grátis).
- CB-05 Cota do Brevo esgotada → CB-01.
- CB-06 Reenvio concorrente → vale o último token; o anterior inválido.
- CB-07 Suspensão da empresa entre criação e envio → não enviar.

## Perguntas em aberto
- PA-01 Limite de reenvio: 1/min por convite é aceitável? (sugerido)
- PA-02 Nome do remetente exibido: "BeeDock" (sugerido).
