import { getIntrospectionQuery } from "graphql";
import { buildSchema, graphqlSync } from "graphql";
import { describe, expect, it } from "vitest";

import {
  introspectionPayload,
  parseIntrospectionResponse,
  schemaFromIntrospection,
} from "./graphqlSchema";

const schema = buildSchema("type Query { hello(name: String): String }");
const introspection = graphqlSync({ schema, source: getIntrospectionQuery() });

describe("graphqlSchema", () => {
  it("monta o payload com a query de introspecção", () => {
    expect(JSON.parse(introspectionPayload()).query).toContain("__schema");
  });

  it("recria o schema a partir de uma resposta de introspecção", () => {
    const parsed = parseIntrospectionResponse(JSON.stringify(introspection));
    expect(schemaFromIntrospection(parsed).getQueryType()?.getFields().hello).toBeDefined();
  });

  it("falha com mensagem clara para erro GraphQL, não-JSON e resposta sem schema", () => {
    expect(() =>
      parseIntrospectionResponse(JSON.stringify({ errors: [{ message: "Not allowed" }] })),
    ).toThrow("Not allowed");
    expect(() => parseIntrospectionResponse("<html>")).toThrow("not JSON");
    expect(() => parseIntrospectionResponse(JSON.stringify({ data: {} }))).toThrow("no GraphQL");
  });
});
