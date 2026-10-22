"use server";

/*
 * Contrato de campos (FormData):
 * - inviteMemberAction(organizationId | null, prev, fd): name, email, phone (opcional), role ("ADMIN" | "FUNCIONARIO").
 *   organizationId null = empresa da sessão (Admin); string = MASTER escolhendo a empresa. Sucesso: { ok, inviteUrl }.
 * - linkUserAction(prev, fd): organizationId, email, role. Só MASTER.
 * - changeMemberRoleAction / setMemberActiveAction / revokeInvitationAction: argumentos diretos (sem FormData);
 *   qualquer FieldError (ex.: último Admin) também sai em `error`, para toast.
 * - switchOrganizationAction(organizationId) / leaveOrganizationAction(): sem FormData; redirecionam no sucesso.
 * - findUserByEmailAction(email): MASTER; e-mail inválido ou sem permissão = null.
 * fieldErrors usa as mesmas chaves dos campos; values devolve os campos de texto enviados.
 */

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FormState, plainValues, toFormState } from "@/lib/form-state";
import { ForbiddenError } from "@/lib/permissions";
import { requestMeta } from "@/lib/request";
import { getCurrentSession, requireTenant } from "@/lib/session";
import { platformActor } from "@/features/platform/actor";
import { findUserByEmail } from "@/features/platform/users";
import {
  changeMemberRole,
  inviteMember,
  linkUser,
  revokeInvitation,
  setMemberActive,
  type MemberActor,
} from "./service";
import { leaveOrganization, switchOrganization, type SessionActor } from "./switch";
import { linkUserSchema, memberInviteSchema, roleSchema } from "./schemas";

const NOT_FOUND = "Este registro não existe mais. Atualize a página.";
const idSchema = z.string().min(1);

type MemberResult = FormState & { inviteUrl?: string };

async function memberActor(organizationId: string | null): Promise<{ actor: MemberActor; organizationId: string }> {
  if (organizationId === null) {
    const ctx = await requireTenant();
    const actor: MemberActor = {
      userId: ctx.userId,
      userName: ctx.userName,
      role: ctx.role,
      auditRole: ctx.auditRole,
      organizationId: ctx.organizationId,
      isMaster: false, // MASTER na própria empresa vale pelo papel do vínculo
      meta: ctx.meta,
    };
    return { actor, organizationId: ctx.organizationId };
  }
  return { actor: await platformActor(), organizationId: idSchema.parse(organizationId) };
}

function revalidateTeam(organizationId: string) {
  revalidatePath("/configuracoes/equipe");
  revalidatePath(`/plataforma/empresas/${organizationId}`);
  revalidatePath("/plataforma/usuarios");
}

/** Ações de linha: FieldError também vira `error` geral (toast). */
function rowState(e: unknown): FormState {
  const state = toFormState(e, NOT_FOUND);
  return { ...state, error: state.error ?? Object.values(state.fieldErrors ?? {})[0] };
}

export async function inviteMemberAction(organizationId: string | null, _prev: MemberResult, fd: FormData): Promise<MemberResult> {
  const values = plainValues(fd);
  try {
    const { actor, organizationId: orgId } = await memberActor(organizationId);
    const { inviteUrl } = await inviteMember(actor, orgId, memberInviteSchema.parse(values));
    revalidateTeam(orgId);
    return { ok: true, inviteUrl };
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
}

export async function linkUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const actor = await platformActor();
    const input = linkUserSchema.parse(values);
    await linkUser(actor, input);
    revalidateTeam(input.organizationId);
  } catch (e) {
    return toFormState(e, NOT_FOUND, values);
  }
  return { ok: true };
}

export async function changeMemberRoleAction(organizationId: string | null, membershipId: string, role: string): Promise<FormState> {
  try {
    const { actor, organizationId: orgId } = await memberActor(organizationId);
    await changeMemberRole(actor, orgId, idSchema.parse(membershipId), roleSchema.parse(role));
    revalidateTeam(orgId);
  } catch (e) {
    return rowState(e);
  }
  return { ok: true };
}

export async function setMemberActiveAction(organizationId: string | null, membershipId: string, active: boolean): Promise<FormState> {
  try {
    const { actor, organizationId: orgId } = await memberActor(organizationId);
    await setMemberActive(actor, orgId, idSchema.parse(membershipId), z.boolean().parse(active));
    revalidateTeam(orgId);
  } catch (e) {
    return rowState(e);
  }
  return { ok: true };
}

export async function revokeInvitationAction(organizationId: string | null, invitationId: string): Promise<FormState> {
  try {
    const { actor, organizationId: orgId } = await memberActor(organizationId);
    await revokeInvitation(actor, orgId, idSchema.parse(invitationId));
    revalidateTeam(orgId);
  } catch (e) {
    return rowState(e);
  }
  return { ok: true };
}

async function sessionActor(): Promise<SessionActor> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return {
    sessionId: session.sessionId,
    userId: session.user.id,
    userName: session.user.name,
    isMaster: session.user.isMaster,
    currentOrganizationId: session.organization?.id ?? null,
    meta: requestMeta(await headers()),
  };
}

export async function switchOrganizationAction(organizationId: string): Promise<FormState> {
  try {
    await switchOrganization(await sessionActor(), idSchema.parse(organizationId));
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidatePath("/", "layout");
  redirect("/inicio");
}

export async function leaveOrganizationAction(): Promise<FormState> {
  try {
    await leaveOrganization(await sessionActor());
  } catch (e) {
    return toFormState(e, NOT_FOUND);
  }
  revalidatePath("/", "layout");
  redirect("/plataforma");
}

export async function findUserByEmailAction(email: string): Promise<{ name: string } | null> {
  const parsed = z.email().safeParse(String(email).trim().toLowerCase());
  if (!parsed.success) return null;
  try {
    return await findUserByEmail(await platformActor(), parsed.data);
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    unstable_rethrow(e);
    throw e;
  }
}
