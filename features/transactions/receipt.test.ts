import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReceiptPdf, receiptLines, receiptNumber, type ReceiptData } from "./receipt-pdf";

const base = (): ReceiptData => ({
  org: {
    name: "Camisaria Prime",
    legalName: "Prime Confecções LTDA",
    document: "12345678000190",
    phone: "(86) 99876-1234",
    email: "contato@prime.com.br",
    zipCode: "64000-000",
    street: "Rua das Flores",
    number: "100",
    complement: null,
    district: "Centro",
    city: "Teresina",
    state: "PI",
    logoUrl: null,
    timezone: "America/Fortaleza",
  },
  tx: {
    id: "cmvi77b4h0000abc",
    occurredOn: "2026-10-15",
    amountCents: 15_000,
    description: "20 camisas",
    payerName: "Ana Souza",
    payerDocument: "12345678909",
    paymentMethod: "Pix",
  },
  issuedAt: new Date("2026-10-21T15:30:00Z"),
});

describe("receiptNumber", () => {
  it("usa ano, mês e 6 primeiros caracteres do id em maiúsculas", () => {
    expect(receiptNumber({ id: "cmvi77b4h0000abc", occurredOn: "2026-10-15" })).toBe("R-2026-10-CMVI77");
  });
});

describe("receiptLines", () => {
  it("com pagador e forma de pagamento", () => {
    const l = receiptLines(base());
    expect(l.body).toBe(
      "Recebi(emos) de Ana Souza, CPF 123.456.789-09, a importância de R$ 150,00 (cento e cinquenta reais), referente a 20 camisas, pago via Pix.",
    );
    expect(l.place).toBe("Teresina, 15 de outubro de 2026");
    expect(l.amount).toBe("R$ 150,00");
    expect(l.title).toBe("RECIBO");
    expect(l.signature).toBe("Camisaria Prime");
    expect(l.heading).toContain("CNPJ 12.345.678/0001-90");
    expect(l.footer).toMatch(/^Gerado pelo BeeDock em /);
  });
  it("sem pagador deixa linha em branco; sem forma omite o trecho", () => {
    const d = base();
    d.tx.payerName = null;
    d.tx.payerDocument = null;
    d.tx.paymentMethod = null;
    const l = receiptLines(d);
    expect(l.body).toContain("Recebi(emos) de ____________________, a importância");
    expect(l.body).not.toContain(" pago via");
    expect(l.body.endsWith("referente a 20 camisas.")).toBe(true);
  });
});

describe("buildReceiptPdf", () => {
  it("gera 1 página A4 válida, mesmo com caracteres fora do WinAnsi", async () => {
    const d = base();
    d.tx.description = "Camisas − lote 😀 com acentuação: ção, ã, é " + "texto longo ".repeat(30);
    const bytes = await buildReceiptPdf(d, null);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    if (process.env.RECEIPT_SAMPLE_OUT) writeFileSync(process.env.RECEIPT_SAMPLE_OUT, bytes);
  });
  it("com logo PNG embute sem falhar", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 200, height: 80, channels: 3, background: "#F5A400" } })
      .png()
      .toBuffer();
    const bytes = await buildReceiptPdf(base(), new Uint8Array(png));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("logo (SSRF)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const withLogo = (logoUrl: string): ReceiptData => {
    const d = base();
    d.org.logoUrl = logoUrl;
    return d;
  };
  it("http e host fora do Blob não fazem fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const u of [
      "http://abc.public.blob.vercel-storage.com/l.webp",
      "https://evil.example.com/l.webp",
      "https://public.blob.vercel-storage.com.evil.com/l.webp",
      "não é url",
    ]) {
      expect((await PDFDocument.load(await buildReceiptPdf(withLogo(u)))).getPageCount()).toBe(1);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("content-length acima de 2 MB é recusado e o PDF sai sem logo", async () => {
    const f = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(10), { headers: { "content-length": "3000000" } }));
    vi.stubGlobal("fetch", f);
    const bytes = await buildReceiptPdf(withLogo("https://abc.public.blob.vercel-storage.com/l.webp"));
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![1]).toMatchObject({ redirect: "error" });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
  it("corpo acima de 2 MB sem content-length é cortado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(2_200_000))));
    const bytes = await buildReceiptPdf(withLogo("https://abc.public.blob.vercel-storage.com/l.webp"));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
