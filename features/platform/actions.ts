"use server";

/*
 * Contrato de campos (FormData):
 * - createOrganizationAction: campos da empresa com o nome do schema (name, slug, ..., "settings.monthStartDay", ...)
 *   e campos do Admin com prefixo "admin." (admin.name, admin.email, admin.phone). fieldErrors usa as mesmas chaves.
 * - updateOrganizationAction: igual, sem "admin.*".
 * - resendInvitationAction: name, email, phone (sem prefixo).
 * - acceptInvitationAction: token (hidden), password, confirm.
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { ForbiddenError } from "@/lib/permissions";
import { requestMeta } from "@/lib/request";
import { platformActor } from "./actor";
import { INVITE_FLASH } from "./invite-flash";
import { FieldError } from "./errors";
import { acceptInvitation, resendInvitation } from "./invitations";
import { acceptInviteSchema, adminInviteSchema, formDataToObject, organizationSchema } from "./schemas";
import {
  createOrganization,
  setOrganizationStatus,
  updateOrganization,
} from "./service";

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  inviteUrl?: string;
  values?: Record<string, unknown>;
};

const flashPath = (id: string) => `/plataforma/empresas/${id}`;

function toState(e: unknown, values?: Record<string, unknown>, prefix = "", fieldMap: Record<string, string> = {}): FormState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) {
      const key = prefix + i.path.join(".");
      fieldErrors[key] ??= i.message;
    }
    return { fieldErrors, values };
  }
  if (e instanceof FieldError) return { fieldErrors: { [fieldMap[e.field] ?? e.field]: e.message }, values };
  if (e instanceof ForbiddenError) return { error: e.message, values };
  throw e;
}


function splitAdmin(fd: FormData) {
  const org = new FormData();
  const admin: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("admin.")) admin[k.slice(6)] = v;
    else org.append(k, v);
  }
  return { org: formDataToObject(org), admin };
}

export async function createOrganizationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { org, admin } = splitAdmin(fd);
  const values = { ...org, ...Object.fromEntries(Object.entries(admin).map(([k, v]) => [`admin.${k}`, v])) };
  let organizationId: string;
  let inviteUrl: string;
  try {
    const actor = await platformActor();
    const parsedOrg = organizationSchema.safeParse(org);
    const parsedAdmin = adminInviteSchema.safeParse(admin);
    if (!parsedOrg.success || !parsedAdmin.success) {
      return {
        fieldErrors: {
          ...(parsedOrg.success ? {} : toState(parsedOrg.error).fieldErrors),
          ...(parsedAdmin.success ? {} : toState(parsedAdmin.error, undefined, "admin.").fieldErrors),
        },
        values,
      };
    }
    ({ organizationId, inviteUrl } = await createOrganization(actor, parsedOrg.data, parsedAdmin.data));
  } catch (e) {
    return toState(e, values, "", { email: "admin.email" });
  }
  (await cookies()).set(INVITE_FLASH, inviteUrl, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: flashPath(organizationId),
  });
  revalidatePath("/plataforma/empresas");
  redirect(flashPath(organizationId));
}

export async function updateOrganizationAction(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formDataToObject(fd);
  try {
    const actor = await platformActor();
    await updateOrganization(actor, id, organizationSchema.parse(values));
  } catch (e) {
    return toState(e, values);
  }
  revalidatePath("/plataforma/empresas");
  revalidatePath(flashPath(id));
  return { ok: true, values };
}

export async function resendInvitationAction(organizationId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const values = formDataToObject(fd);
  try {
    const actor = await platformActor();
    const { inviteUrl } = await resendInvitation(actor, organizationId, adminInviteSchema.parse(values));
    revalidatePath(flashPath(organizationId));
    return { ok: true, inviteUrl };
  } catch (e) {
    return toState(e, values);
  }
}

const reasonSchema = z.string().trim().max(500, "Máximo de 500 caracteres.").optional().transform((v) => v || undefined);

export async function setOrganizationStatusAction(
  id: string,
  status: "ACTIVE" | "SUSPENDED",
  reason?: string,
): Promise<FormState> {
  try {
    const actor = await platformActor();
    await setOrganizationStatus(actor, id, z.enum(["ACTIVE", "SUSPENDED"]).parse(status), reasonSchema.parse(reason));
  } catch (e) {
    return toState(e);
  }
  revalidatePath("/plataforma/empresas");
  revalidatePath(flashPath(id));
  return { ok: true };
}

export async function acceptInvitationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = acceptInviteSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return toState(parsed.error);
  const result = await acceptInvitation(
    { token: parsed.data.token, password: parsed.data.password },
    requestMeta(await headers()),
  );
  if (!result.ok) return { error: "Convite inválido ou expirado. Peça um novo ao suporte." };
  redirect(`/login?convite=aceito&email=${encodeURIComponent(result.email)}`);
}

export async function consumeInviteFlashAction(organizationId: string): Promise<void> {
  (await cookies()).set(INVITE_FLASH, "", { path: flashPath(organizationId), maxAge: 0 });
}
