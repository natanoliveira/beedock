import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc123_xyz" } }));
const blob = vi.hoisted(() => ({
  put: vi.fn(async () => ({ url: "https://x.public.blob.vercel-storage.com/org/o1/logo-1.webp" })),
  del: vi.fn(async () => {}),
}));
vi.mock("@vercel/blob", () => blob);

const { storeLogo, deleteLogoBlob } = await import("./logo");
const fd = (type: string, size = 10) => {
  const f = new FormData();
  f.set("logo", new File([new Uint8Array(size)], "l", { type }));
  return f;
};

beforeEach(() => vi.clearAllMocks());

describe("storeLogo", () => {
  it("envia PNG válido", async () => {
    expect(await storeLogo("o1", fd("image/png"))).toEqual({ url: expect.stringContaining("logo-1.webp") });
    expect(blob.put).toHaveBeenCalledOnce();
  });
  it("recusa tipo, tamanho e ausência", async () => {
    expect(await storeLogo("o1", fd("image/gif"))).toEqual({ error: "Use uma imagem PNG, JPG ou WebP." });
    expect(await storeLogo("o1", fd("image/png", 1_048_577))).toEqual({ error: "A imagem deve ter no máximo 1 MB." });
    expect(await storeLogo("o1", new FormData())).toEqual({ error: "Selecione uma imagem." });
    expect(blob.put).not.toHaveBeenCalled();
  });
  it("erro do blob vira mensagem", async () => {
    blob.put.mockRejectedValueOnce(new Error("boom"));
    expect(await storeLogo("o1", fd("image/png"))).toEqual({
      error: "Não foi possível enviar o logo agora. Tente de novo.",
    });
  });
});

describe("deleteLogoBlob", () => {
  const own = "https://x.public.blob.vercel-storage.com/org/o1/logo-1.webp";
  it("apaga blob da própria empresa com token e URL", async () => {
    await deleteLogoBlob(own, "o1");
    expect(blob.del).toHaveBeenCalledWith(own, { token: "vercel_blob_rw_abc123_xyz" });
  });
  it("não apaga de outra empresa, URL antiga ou inválida", async () => {
    await deleteLogoBlob(own, "o2");
    await deleteLogoBlob("https://x.public.blob.vercel-storage.com/logos/old.webp", "o1");
    await deleteLogoBlob("não é url", "o1");
    expect(blob.del).not.toHaveBeenCalled();
  });
  it("não relança falha", async () => {
    blob.del.mockRejectedValueOnce(new Error("boom"));
    await expect(deleteLogoBlob(own, "o1")).resolves.toBeUndefined();
  });
});
