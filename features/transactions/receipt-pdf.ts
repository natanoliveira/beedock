import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import sharp from "sharp";
import { logger } from "@/lib/logger";
import { valorPorExtenso } from "./money";

export type ReceiptOrg = {
  name: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
  timezone: string;
};

export type ReceiptData = {
  org: ReceiptOrg;
  tx: {
    id: string;
    occurredOn: string;
    amountCents: number;
    description: string;
    payerName: string | null;
    payerDocument: string | null;
    paymentMethod: string | null;
  };
  issuedAt: Date;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const brl = (cents: number) =>
  `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`;

function formatDocument(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `CPF ${d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`;
  if (d.length === 14) return `CNPJ ${d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}`;
  return raw;
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS[m! - 1]} de ${y}`;
};

export function receiptNumber(tx: { id: string; occurredOn: string }): string {
  const code = tx.id
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();
  return `R-${tx.occurredOn.slice(0, 4)}-${tx.occurredOn.slice(5, 7)}-${code}`;
}

function addressLine(o: ReceiptOrg): string {
  const street = [o.street, o.number].filter(Boolean).join(", ");
  const parts = [
    [street, o.complement].filter(Boolean).join(" - "),
    o.district,
    [o.city, o.state].filter(Boolean).join("/"),
    o.zipCode ? `CEP ${o.zipCode}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function receiptLines(data: ReceiptData) {
  const { org, tx } = data;
  const contact = [org.phone ? `Tel. ${org.phone}` : null, org.email].filter(Boolean).join(" · ");
  const heading = [
    org.name,
    org.legalName && org.legalName !== org.name ? org.legalName : null,
    org.document ? formatDocument(org.document) : null,
    addressLine(org) || null,
    contact || null,
  ].filter((l): l is string => Boolean(l));

  const amount = brl(tx.amountCents);
  const amountWords = valorPorExtenso(tx.amountCents);
  const payer = tx.payerName?.trim()
    ? `${tx.payerName.trim()}${tx.payerDocument ? `, ${formatDocument(tx.payerDocument)}` : ""}`
    : "____________________";
  const via = tx.paymentMethod ? `, pago via ${tx.paymentMethod}` : "";
  const body = `Recebi(emos) de ${payer}, a importância de ${amount} (${amountWords}), referente a ${tx.description.trim()}${via}.`;
  const stamp = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: org.timezone,
  }).format(data.issuedAt);

  return {
    heading,
    title: "RECIBO",
    number: receiptNumber(tx),
    amount,
    amountWords,
    body,
    place: [org.city, longDate(tx.occurredOn)].filter(Boolean).join(", "),
    signature: org.name,
    footer: `Gerado pelo BeeDock em ${stamp}`,
  };
}

function safeText(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of text.replace(/[−–—]/g, "-").replace(/\s+/g, " ")) {
    out += supported.has(ch.codePointAt(0)!) ? ch : "?";
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = (w: string) => {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      return;
    }
    if (line) lines.push(line);
    line = "";
    let rest = w;
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      let n = rest.length - 1;
      while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxWidth) n--;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  };
  for (const w of text.split(" ")) if (w) push(w);
  if (line) lines.push(line);
  return lines;
}

const MAX_LOGO_BYTES = 2_097_152;
const LOGO_HOST = ".public.blob.vercel-storage.com";

async function readLimited(res: Response): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_LOGO_BYTES) throw new Error("logo too large");
  if (!res.body) throw new Error("no body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LOGO_BYTES) {
      await reader.cancel();
      throw new Error("logo too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchLogo(raw: string): Promise<Uint8Array | null> {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname.endsWith(LOGO_HOST)) throw new Error("logo host not allowed");
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const input = await readLimited(res);
    const png = await sharp(input, { limitInputPixels: 4096 * 4096 })
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return new Uint8Array(png);
  } catch (e) {
    logger.warn("receipt.logo_failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** `logo`: PNG já pronto; `undefined` busca `org.logoUrl`; `null` desenha sem logo. */
export async function buildReceiptPdf(data: ReceiptData, logo?: Uint8Array | null): Promise<Uint8Array> {
  const L = receiptLines(data);
  const logoBytes = logo === undefined ? (data.org.logoUrl ? await fetchLogo(data.org.logoUrl) : null) : logo;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo ${L.number}`);
  pdf.setProducer("BeeDock");
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);
  const M = 50;
  const W = 595.28 - M * 2;
  const text = (s: string, x: number, y: number, size: number, f: PDFFont = regular, color = ink) =>
    page.drawText(safeText(f, s), { x, y, size, font: f, color });
  const centered = (s: string, y: number, size: number, f: PDFFont = regular, color = ink) => {
    const t = safeText(f, s);
    text(t, (595.28 - f.widthOfTextAtSize(t, size)) / 2, y, size, f, color);
  };

  let y = 841.89 - M;
  let textX = M;
  if (logoBytes) {
    try {
      const img = await pdf.embedPng(logoBytes);
      const s = Math.min(64 / img.height, 160 / img.width);
      page.drawImage(img, { x: M, y: y - img.height * s, width: img.width * s, height: img.height * s });
      textX = M + img.width * s + 16;
    } catch (e) {
      logger.warn("receipt.logo_embed_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }
  const headTop = y;
  L.heading.forEach((line, i) => {
    const f = i === 0 ? bold : regular;
    const size = i === 0 ? 15 : 9.5;
    for (const part of wrap(f, safeText(f, line), size, W - (textX - M))) {
      y -= i === 0 ? 17 : 12.5;
      text(part, textX, y, size, f, i === 0 ? ink : muted);
    }
  });
  y = Math.min(y, headTop - 64) - 14;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });

  y -= 48;
  centered(L.title, y, 26, bold);
  y -= 20;
  centered(`Nº ${L.number}`, y, 11, regular, muted);

  y -= 56;
  centered(L.amount, y, 34, bold);
  y -= 20;
  centered(`(${L.amountWords})`, y, 10, regular, muted);

  y -= 48;
  for (const line of wrap(regular, safeText(regular, L.body), 13, W)) {
    text(line, M, y, 13);
    y -= 21;
  }

  y -= 24;
  text(L.place, M, y, 12);

  y -= 80;
  const sigW = 260;
  const sx = (595.28 - sigW) / 2;
  page.drawLine({ start: { x: sx, y }, end: { x: sx + sigW, y }, thickness: 0.8, color: ink });
  const sig = safeText(regular, L.signature);
  text(sig, (595.28 - regular.widthOfTextAtSize(sig, 11)) / 2, y - 15, 11);

  centered(L.footer, M - 10, 8, regular, muted);
  return pdf.save();
}
