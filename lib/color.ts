/** Cor de texto legível (AA) sobre a cor da empresa: própolis ou branco. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#1e160c";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contraste com branco = 1.05 / (L + 0.05); com própolis ≈ (L + 0.05) / 0.059
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.059 ? "#ffffff" : "#1e160c";
}
