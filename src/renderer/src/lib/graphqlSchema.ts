import type { GraphQLSchema, IntrospectionQuery } from "graphql";

import { buildClientSchema, getIntrospectionQuery } from "graphql";

/** Corpo JSON de uma query de introspecção — o mesmo formato do body GraphQL. */
export function introspectionPayload(): string {
  return JSON.stringify({ query: getIntrospectionQuery() });
}

/** Extrai o resultado de introspecção de uma resposta HTTP; lança com mensagem legível. */
export function parseIntrospectionResponse(text: string): IntrospectionQuery {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Response is not JSON");
  }
  const body = parsed as { data?: IntrospectionQuery; errors?: { message?: string }[] };
  if (body.errors?.length && !body.data?.__schema) {
    throw new Error(body.errors[0]?.message ?? "GraphQL error");
  }
  if (!body.data?.__schema) throw new Error("Response has no GraphQL schema");
  return body.data;
}

export function schemaFromIntrospection(introspection: IntrospectionQuery): GraphQLSchema {
  return buildClientSchema(introspection);
}
