import { describe, expect, it } from "vitest";
import { pendingDocuments } from "./rules";

const T1 = { id: "t1", type: "TERMS", version: 1 } as const;
const T2 = { id: "t2", type: "TERMS", version: 2 } as const;
const P1 = { id: "p1", type: "PRIVACY", version: 1 } as const;

describe("pendingDocuments", () => {
  it("sem vigentes: nada pendente", () => expect(pendingDocuments([], new Set())).toEqual([]));
  it("sem aceites: todos", () => expect(pendingDocuments([T1, P1], new Set())).toEqual([T1, P1]));
  it("termos aceitos: só a privacidade", () => expect(pendingDocuments([T1, P1], new Set(["t1"]))).toEqual([P1]));
  it("nova versão: pendente mesmo com a anterior aceita", () =>
    expect(pendingDocuments([T2, P1], new Set(["t1", "p1"]))).toEqual([T2]));
});
