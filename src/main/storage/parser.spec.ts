import { describe, expect, it } from "vitest";

import { DomainError } from "../ipc/errors";
import { parseRequest } from "./parser";

describe("versão de schema ao parsear", () => {
  it("wttp ausente é normalizado para a versão 1", () => {
    const raw = ["name: List users", "seq: 1", "method: GET", "url: /users", ""].join("\n");
    expect(parseRequest(raw).wttp).toBe(1);
  });

  it("versão maior que a suportada recusa parsear", () => {
    const raw = ["wttp: 99", "name: List users", "seq: 1", "method: GET", "url: /users", ""].join(
      "\n",
    );
    expect(() => parseRequest(raw)).toThrow(DomainError);
  });
});
