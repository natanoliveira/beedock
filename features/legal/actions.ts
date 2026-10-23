"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FieldError } from "@/features/platform/errors";
import { platformActor } from "@/features/platform/actor";
import { type FormState, plainValues, toFormState } from "@/lib/form-state";
import { requestMeta } from "@/lib/request";
import { getCurrentSession } from "@/lib/session";
import { acceptTermsSchema, publishLegalSchema } from "./schemas";
import { acceptLegalDocuments, publishLegalDocument } from "./service";

export async function acceptTermsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.user.isMaster) redirect(session.organization ? "/inicio" : "/plataforma"); // MASTER é isento: nunca grava aceite
  try {
    const ids = acceptTermsSchema.parse(fd.getAll("documentId"));
    if (fd.get("agree") !== "on") return { fieldErrors: { agree: "Marque que leu e aceita para continuar." } };
    await acceptLegalDocuments(
      {
        userId: session.user.id,
        userName: session.user.name,
        role: session.role,
        organizationId: null,
        meta: requestMeta(await headers()),
      },
      ids,
    );
  } catch (e) {
    if (e instanceof FieldError) {
      revalidatePath("/aceite");
      return { error: e.message };
    }
    return toFormState(e, "Não foi possível registrar o aceite.");
  }
  redirect("/inicio");
}

export async function publishLegalDocumentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = plainValues(fd);
  try {
    const actor = await platformActor(); // requireAcceptedSession + MASTER
    const input = publishLegalSchema.parse({ type: fd.get("type"), content: fd.get("content") }); // recusa [PREENCHER
    const { version } = await publishLegalDocument(actor, input);
    revalidatePath("/plataforma/termos");
    return { ok: true, values: { version } };
  } catch (e) {
    return toFormState(e, "Não foi possível publicar.", values);
  }
}
