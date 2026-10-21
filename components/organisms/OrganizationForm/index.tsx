"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppButton } from "@/components/atoms/AppButton";
import { AppLabel } from "@/components/atoms/AppLabel";
import { FormField } from "@/components/molecules/FormField";
import { slugify } from "@/lib/document";
import { toFormValues } from "./values";

type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, unknown>;
};

type Props = {
  mode: "create" | "edit";
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Valores iniciais nas chaves do FormData (ver toFormValues). */
  defaults?: Record<string, unknown>;
  /** Campo de logo (LogoDropzone), exibido na seção Marca. */
  logo?: ReactNode;
};

const TIMEZONES = ["America/Fortaleza", "America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Belem", "America/Recife", "America/Bahia", "America/Rio_Branco", "America/Noronha"];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="bg-card grid gap-4 rounded-xl border p-4 md:p-5">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <h2 className="text-lg leading-tight font-extrabold">{title}</h2>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function OrganizationForm({ mode, action, defaults, logo }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = state.values ? toFormValues(state.values) : undefined;
  const val = (k: string) => String(submitted?.[k] ?? defaults?.[k] ?? "");
  const err = (k: string) => state.fieldErrors?.[k];

  const [name, setName] = useState(val("name"));
  const [slug, setSlug] = useState(val("slug"));
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [color, setColor] = useState(val("primaryColor") || "#f5a400");

  useEffect(() => {
    if (state.ok) toast.success("Empresa atualizada.");
    if (state.error) toast.error(state.error);
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  // ViaCEP: falha silenciosa, o usuário preenche à mão.
  async function lookupCep(form: HTMLFormElement | null, raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (d.erro) return;
      const set = (n: string, v?: string) => {
        const el = form?.elements.namedItem(n);
        if (v && el instanceof HTMLInputElement) el.value = v;
      };
      set("street", d.logradouro);
      set("district", d.bairro);
      set("city", d.localidade);
      set("state", d.uf);
    } catch {
      /* silencioso */
    }
  }

  const f = (name: string, label: string, extra: Partial<React.ComponentProps<typeof FormField>> = {}) => (
    <FormField label={label} name={name} defaultValue={val(name)} error={err(name)} {...extra} />
  );

  return (
    <form ref={formRef} action={formAction} noValidate className="grid gap-4">
      <Section title="Identificação">
        <FormField
          label="Nome fantasia *"
          name="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          error={err("name")}
          autoComplete="off"
          required
        />
        <FormField
          label="Endereço (slug) *"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          error={err("slug")}
          hint="Minúsculas, números e hífens."
          autoCapitalize="none"
          autoComplete="off"
          required
        />
        {f("legalName", "Razão social")}
        {f("document", "CPF ou CNPJ", { inputMode: "numeric" })}
      </Section>

      <Section title="Contato">
        {f("phone", "Telefone", { type: "tel", inputMode: "tel", autoComplete: "off" })}
        {f("email", "E-mail", { type: "email", inputMode: "email", autoComplete: "off" })}
      </Section>

      <Section title="Endereço">
        {f("zipCode", "CEP", { inputMode: "numeric", onBlur: (e) => void lookupCep(e.target.form, e.target.value) })}
        {f("street", "Rua")}
        {f("number", "Número")}
        {f("complement", "Complemento")}
        {f("district", "Bairro")}
        {f("city", "Cidade")}
        {f("state", "UF", { maxLength: 2, autoCapitalize: "characters" })}
      </Section>

      <Section title="Pix">{f("pixKey", "Chave Pix", { hint: "CPF, CNPJ, e-mail, telefone ou chave aleatória." })}</Section>

      <Section title="Marca">
        {logo}
        <div className="grid gap-1.5">
          <AppLabel htmlFor="primaryColor">Cor primária</AppLabel>
          <div className="flex items-center gap-3">
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-invalid={err("primaryColor") ? true : undefined}
              className="bg-background h-12 w-16 cursor-pointer rounded-lg border-2 p-1"
            />
            <span className="font-mono text-sm uppercase">{color}</span>
          </div>
          {err("primaryColor") && (
            <p role="alert" className="text-destructive text-sm">
              {err("primaryColor")}
            </p>
          )}
        </div>
      </Section>

      <Section title="Preferências">
        {f("settings.monthStartDay", "Dia de início do mês", { type: "number", inputMode: "numeric", min: 1, max: 28, defaultValue: val("settings.monthStartDay") || "1" })}
        <div>
          {f("settings.timezone", "Fuso horário", { list: "tz-list", defaultValue: val("settings.timezone") || "America/Fortaleza" })}
          <datalist id="tz-list">
            {TIMEZONES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        {f("settings.sessionIdleMinutes", "Ociosidade da sessão (min)", { type: "number", inputMode: "numeric", defaultValue: val("settings.sessionIdleMinutes") || "60" })}
        {f("settings.customerRetentionMonths", "Retenção de clientes (meses)", { type: "number", inputMode: "numeric", defaultValue: val("settings.customerRetentionMonths") || "24" })}
        {f("settings.dpoName", "DPO — nome")}
        {f("settings.dpoEmail", "DPO — e-mail", { type: "email", inputMode: "email" })}
        {f("settings.dpoPhone", "DPO — telefone", { type: "tel", inputMode: "tel" })}
      </Section>

      {mode === "create" && (
        <Section title="Admin da empresa" hint="Recebe um link de convite válido por 48 horas para criar a própria senha.">
          {f("admin.name", "Nome *", { autoComplete: "off", required: true })}
          {f("admin.email", "E-mail *", { type: "email", inputMode: "email", autoComplete: "off", required: true })}
          {f("admin.phone", "Telefone (WhatsApp)", { type: "tel", inputMode: "tel", autoComplete: "off", hint: "Habilita o botão de envio pelo WhatsApp." })}
        </Section>
      )}

      {state.error && (
        <p role="alert" className="bg-expense-soft text-expense rounded-lg px-3 py-2.5 text-sm font-bold">
          {state.error}
        </p>
      )}

      <div className="bg-background/95 sticky bottom-0 -mx-4 border-t px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <AppButton type="submit" size="lg" disabled={pending} className="w-full md:w-auto">
          {pending ? "Salvando…" : mode === "create" ? "Criar empresa e gerar convite" : "Salvar alterações"}
        </AppButton>
      </div>
    </form>
  );
}
