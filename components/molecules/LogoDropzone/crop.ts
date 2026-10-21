const MAX_BYTES = 1_048_576;

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>((res) => c.toBlob(res, type, q));

/** Recorte quadrado central, WebP (JPEG se o navegador não codifica WebP, ex.: iOS Safari); reduz qualidade (e depois o lado) até caber em 1 MB. */
export async function cropToWebp(file: File, side = 512): Promise<File> {
  const bmp = await createImageBitmap(file);
  try {
    const min = Math.min(bmp.width, bmp.height);
    const sx = (bmp.width - min) / 2;
    const sy = (bmp.height - min) / 2;
    let size = Math.min(side, min);
    let type = "image/webp";
    for (;;) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx0 = canvas.getContext("2d")!;
      if (type === "image/jpeg") {
        ctx0.fillStyle = "#fff";
        ctx0.fillRect(0, 0, size, size);
      }
      ctx0.drawImage(bmp, sx, sy, min, min, 0, 0, size, size);
      for (let q = 0.9; q >= 0.4; q -= 0.1) {
        const blob = await toBlob(canvas, type, q);
        if (blob && blob.type !== type) {
          if (type === "image/jpeg") throw new Error("Navegador sem suporte a codificar a imagem.");
          // navegador devolveu outro formato (sem encoder WebP): recomeça em JPEG
          type = "image/jpeg";
          // JPEG não tem alpha: pinta branco atrás do que já foi desenhado
          const ctx = canvas.getContext("2d")!;
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, size, size);
          ctx.globalCompositeOperation = "source-over";
          q = 1;
          continue;
        }
        if (blob && blob.size <= MAX_BYTES) {
          return new File([blob], `logo.${type === "image/webp" ? "webp" : "jpg"}`, { type });
        }
      }
      if (size <= 64) throw new Error("Não foi possível reduzir a imagem para 1 MB.");
      size = Math.floor(size / 2);
    }
  } finally {
    bmp.close();
  }
}
