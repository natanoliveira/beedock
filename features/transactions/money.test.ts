import { describe, expect, it } from "vitest";
import { parseBrl, valorPorExtenso } from "./money";

describe("parseBrl", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,5", 123450],
    ["R$ 10", 1000],
    ["10,99", 1099],
    ["0,01", 1],
    ["1.000.000,00", 100000000],
  ])("%s -> %i", (input, cents) => {
    expect(parseBrl(input)).toBe(cents);
  });
  it.each(["0,00", "0", "-5", "abc", "", "1.000.000,01", "1,234", "1,2,3"])("rejeita %s", (input) => {
    expect(parseBrl(input)).toBeNull();
  });
});

describe("valorPorExtenso", () => {
  it.each([
    [1, "um centavo"],
    [2, "dois centavos"],
    [100, "um real"],
    [101, "um real e um centavo"],
    [2150, "vinte e um reais e cinquenta centavos"],
    [10000, "cem reais"],
    [100110, "mil e um reais e dez centavos"],
    [15000, "cento e cinquenta reais"],
    [215000, "dois mil cento e cinquenta reais"],
    [200000, "dois mil reais"],
    [1100000 / 10, "mil e cem reais"],
    [100000000, "um milhão de reais"],
    [0, "zero real"],
  ])("%i -> %s", (cents, text) => {
    expect(valorPorExtenso(cents)).toBe(text);
  });
});
