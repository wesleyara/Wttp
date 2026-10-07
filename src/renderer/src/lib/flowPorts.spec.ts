import type { RequestFile } from "@shared";

import { describe, expect, it } from "vitest";

import { findRequestData, outputPorts, requestVariables } from "./flowPorts";

const request = (extra: Partial<RequestFile>): RequestFile => ({
  wttp: 1,
  name: "r",
  seq: 1,
  method: "GET",
  url: "{{base}}/users/{{user_id}}",
  ...extra,
});

describe("requestVariables", () => {
  it("collects variables from url, query, headers, auth and body, once each", () => {
    expect(
      requestVariables(
        request({
          query: [
            { name: "q", value: "{{term}}", enabled: true },
            { name: "off", value: "{{disabled}}", enabled: false },
          ],
          headers: [{ name: "X-Trace", value: "{{trace}}-{{$uuid}}", enabled: true }],
          auth: { type: "bearer", bearer: { token: "{{token}}" } },
          body: { type: "json", json: '{"id": "{{user_id}}", "t": "{{ token }}"}' },
        }),
      ),
    ).toEqual(["base", "user_id", "term", "trace", "token"]);
  });

  it("handles requests with nothing to substitute", () => {
    expect(requestVariables(request({ url: "https://x.test" }))).toEqual([]);
  });
});

describe("findRequestData", () => {
  it("walks the tree down to the request", () => {
    const data = request({});
    const tree = [
      {
        kind: "folder" as const,
        path: "api",
        name: "api",
        seq: 1,
        data: null,
        children: [{ kind: "request" as const, path: "api/a.req.yaml", name: "a", seq: 1, data }],
      },
    ];
    expect(findRequestData(tree, "api/a.req.yaml")).toBe(data);
    expect(findRequestData(tree, "api/missing.req.yaml")).toBeNull();
  });
});

describe("outputPorts", () => {
  it("offers status, a few headers and the JSON fields", () => {
    const ports = outputPorts({
      status: 201,
      headers: [{ name: "Location", value: "/users/7" }],
      body: JSON.stringify({ id: 7, data: { token: "abc" } }),
      bodyTruncated: false,
    });
    expect(ports.map(port => [port.id, port.preview])).toEqual([
      ["status", "201"],
      ["header:Location", "/users/7"],
      ["body:id", "7"],
      ["body:data.token", "abc"],
    ]);
    expect(ports[3].source).toEqual({ kind: "body", path: "data.token" });
  });

  it("is empty without a sample, and skips the body when it is not JSON", () => {
    expect(outputPorts(undefined)).toEqual([]);
    expect(
      outputPorts({ status: 200, headers: [], body: "plain", bodyTruncated: false }).map(
        port => port.id,
      ),
    ).toEqual(["status"]);
  });
});
