import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc123_xyz" } }));
const blob = vi.hoisted(() => ({
  put: vi.fn(async (pathname: string) => ({ pathname })),
  del: vi.fn(async () => {}),
  get: vi.fn(async () => ({ statusCode: 200, stream: new ReadableStream(), blob: { contentType: "application/pdf" } })),
}));
vi.mock("@vercel/blob", () => blob);

const { uploadReceipt, deleteReceipt, readReceipt } = await import("./storage");

const file = (bytes: number[], type: string) => new File([new Uint8Array(bytes)], "c", { type });
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPG = [0xff, 0xd8, 0xff];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

beforeEach(() => vi.clearAllMocks());

describe("uploadReceipt: magic bytes", () => {
  it.each([
    ["application/pdf", PDF, "pdf"],
    ["image/png", PNG, "png"],
    ["image/jpeg", JPG, "jpg"],
    ["image/webp", WEBP, "webp"],
  ])("aceita %s com assinatura correta", async (type, bytes, ext) => {
    const path = await uploadReceipt("org1", "tx1", file(bytes, type));
    expect(path).toMatch(new RegExp(`^org/org1/receipts/tx1-\\d+\\.${ext}$`));
    expect(blob.put).toHaveBeenCalledOnce();
  });

  it.each([
    ["PNG declarado como PDF", "application/pdf", PNG],
    ["PDF declarado como PNG", "image/png", PDF],
    ["RIFF sem WEBP", "image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]],
    ["arquivo curto", "image/jpeg", [0xff, 0xd8]],
  ])("recusa %s", async (_, type, bytes) => {
    await expect(uploadReceipt("org1", "tx1", file(bytes, type))).rejects.toThrow("Arquivo inválido ou corrompido.");
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("recusa tipo fora da lista e id com caractere de caminho", async () => {
    await expect(uploadReceipt("org1", "tx1", file(PDF, "text/html"))).rejects.toThrow("Use PNG, JPG, WebP ou PDF.");
    await expect(uploadReceipt("org1", "../tx", file(PDF, "application/pdf"))).rejects.toThrow("Arquivo inválido");
    expect(blob.put).not.toHaveBeenCalled();
  });
});

describe("ownsPath: comprovante só da própria empresa", () => {
  const own = "org/org1/receipts/tx1-1.pdf";
  const foreign = ["org/org2/receipts/tx1-1.pdf", "org/org1/receipts/../../org2/receipts/x.pdf", "org/org10/receipts/x.pdf", "org/org1/logo-1.webp"];

  it("lê e exclui caminho da empresa", async () => {
    expect(await readReceipt("org1", own)).not.toBeNull();
    await deleteReceipt("org1", own);
    expect(blob.get).toHaveBeenCalledOnce();
    expect(blob.del).toHaveBeenCalledWith(own, expect.anything());
  });

  it.each(foreign)("recusa %s", async (path) => {
    expect(await readReceipt("org1", path)).toBeNull();
    await deleteReceipt("org1", path);
    expect(blob.get).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });
});
