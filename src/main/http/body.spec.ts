import { describe, expect, it } from "vitest";

import { buildRequestBody } from "./body";

describe("buildRequestBody: graphql", () => {
  it("manda { query, variables } como JSON", async () => {
    const built = await buildRequestBody({
      type: "graphql",
      graphql: { query: "query { a }", variables: '{ "id": 1 }' },
    });
    expect(built?.contentType).toBe("application/json");
    expect(JSON.parse(built!.buffer.toString("utf-8"))).toEqual({
      query: "query { a }",
      variables: { id: 1 },
    });
  });

  it("omite variables quando vazio", async () => {
    const built = await buildRequestBody({
      type: "graphql",
      graphql: { query: "query { a }", variables: "  " },
    });
    expect(JSON.parse(built!.buffer.toString("utf-8"))).toEqual({ query: "query { a }" });
  });

  it("falha com variables que não são JSON", async () => {
    await expect(
      buildRequestBody({ type: "graphql", graphql: { query: "q", variables: "{oops" } }),
    ).rejects.toThrow(/valid JSON/);
  });
});
