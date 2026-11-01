import { cn } from "@/lib/utils";
import type { BrandMarkProps } from "./BrandMark.types";

const R = 30;
const r = R - 3;
const W = Math.sqrt(3) * R;
const CX = 55.5;
const TOP = 36;
const BOTTOM = TOP + 1.5 * R;

const points = (cx: number, cy: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((90 + 60 * k) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy - r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/** Favo de 3 hexágonos: a marca do BeeDock (public/brand/logo-mark.svg). */
export function BrandMark({ tone = "onLight", className }: BrandMarkProps) {
  return (
    <svg aria-hidden viewBox="0 0 111 114" className={cn("h-10 w-auto shrink-0", className)}>
      <polygon points={points(CX - W / 2, TOP)} fill="var(--mel)" />
      <polygon points={points(CX + W / 2, TOP)} fill={tone === "onDark" ? "var(--ink-foreground)" : "var(--foreground)"} />
      <polygon points={points(CX, BOTTOM)} fill="var(--primary-strong)" />
    </svg>
  );
}
