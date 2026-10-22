import { describe, expect, it } from "vitest";
import {
  currentFinancialMonth,
  financialMonthRange,
  formatYearMonth,
  monthLabel,
  parseYearMonth,
  shiftMonth,
  todayIn,
} from "./period";

describe("todayIn", () => {
  it("usa o fuso da empresa perto da meia-noite UTC", () => {
    expect(todayIn("America/Fortaleza", new Date("2026-11-01T02:30:00Z"))).toBe("2026-10-31");
    expect(todayIn("America/Fortaleza", new Date("2026-11-01T03:00:00Z"))).toBe("2026-11-01");
  });
});

describe("currentFinancialMonth", () => {
  const now = new Date("2026-11-03T15:00:00Z");
  it("dia de início 5 ainda está em outubro no dia 3", () => {
    expect(currentFinancialMonth(5, "America/Fortaleza", now)).toEqual({ year: 2026, month: 10 });
  });
  it("dia de início 1 é o mês civil", () => {
    expect(currentFinancialMonth(1, "America/Fortaleza", now)).toEqual({ year: 2026, month: 11 });
  });
  it("vira o ano para trás em janeiro", () => {
    expect(currentFinancialMonth(5, "America/Fortaleza", new Date("2027-01-02T15:00:00Z"))).toEqual({
      year: 2026,
      month: 12,
    });
  });
});

describe("financialMonthRange", () => {
  it("dia 1 cobre o mês civil", () => {
    expect(financialMonthRange({ year: 2026, month: 10 }, 1)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(financialMonthRange({ year: 2027, month: 2 }, 1).to).toBe("2027-02-28");
    expect(financialMonthRange({ year: 2028, month: 2 }, 1).to).toBe("2028-02-29");
  });
  it("dia 5 termina no dia 4 do mês seguinte", () => {
    expect(financialMonthRange({ year: 2026, month: 10 }, 5)).toEqual({ from: "2026-10-05", to: "2026-11-04" });
  });
  it("vira o ano", () => {
    expect(financialMonthRange({ year: 2026, month: 12 }, 5)).toEqual({ from: "2026-12-05", to: "2027-01-04" });
  });
});

describe("year-month", () => {
  it("parse e format", () => {
    expect(parseYearMonth("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(formatYearMonth({ year: 2026, month: 3 })).toBe("2026-03");
  });
  it.each([undefined, "", "2026-13", "2026-00", "abc", "2026-1", "1999-05"])("rejeita %s", (v) => {
    expect(parseYearMonth(v)).toBeNull();
  });
  it("shiftMonth atravessa anos", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
  });
});

describe("monthLabel", () => {
  it("com dia de início 5 mostra o intervalo", () => {
    expect(monthLabel({ year: 2026, month: 10 }, 5)).toEqual({ title: "Outubro de 2026", range: "5/10 a 4/11" });
  });
  it("com dia 1 não mostra intervalo", () => {
    expect(monthLabel({ year: 2026, month: 10 }, 1)).toEqual({ title: "Outubro de 2026", range: null });
  });
});
