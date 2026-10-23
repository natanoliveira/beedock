import { describe, expect, it } from "vitest";
import { csvDate, csvMoney, toCsv } from "@/lib/csv";

describe("csv pt-BR", () => {
  it("BOM, separador ; e CRLF", () => {
    expect(toCsv(["a", "b"], [["x", 1]])).toBe("﻿a;b\r\nx;1\r\n");
  });

  it("escapa ; aspas e quebra de linha", () => {
    expect(toCsv(["a"], [["x;y"], ['a"b'], ["l1\nl2"]])).toBe('﻿a\r\n"x;y"\r\n"a""b"\r\n"l1\nl2"\r\n');
  });

  it("neutraliza injeção de fórmula", () => {
    const out = toCsv(["a"], [["=1+1"], ["+1"], ["-1"], ["@x"]]);
    expect(out).toBe("﻿a\r\n'=1+1\r\n'+1\r\n'-1\r\n'@x\r\n");
  });

  it("não prefixa números negativos nem null", () => {
    expect(toCsv(["a", "b"], [[-5, null]])).toBe("﻿a;b\r\n-5;\r\n");
  });

  it("valor e data", () => {
    expect(csvMoney(123456)).toBe("1234,56");
    expect(csvMoney(-5)).toBe("-0,05");
    expect(csvMoney(0)).toBe("0,00");
    expect(csvDate("2026-10-05")).toBe("05/10/2026");
  });
});
