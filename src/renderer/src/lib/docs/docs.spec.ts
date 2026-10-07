import type { FolderNode, RequestNode } from "@shared";

import { describe, expect, it } from "vitest";

import { renderDocsHtml } from "./exportHtml";
import { renderDocsMarkdown } from "./exportMarkdown";
import {
  buildDocsModel,
  countRequests,
  describeBody,
  type DocsRequest,
  flattenDocs,
  requestSnippet,
} from "./model";

const SECRETS = [
  "sk-live-BEARER-SECRET",
  "hunter2-PASSWORD",
  "apikey-LITERAL-SECRET",
  "cookie-SESSION-SECRET",
];

function request(
  path: string,
  name: string,
  extra: Partial<RequestNode["data"] & object> = {},
): RequestNode {
  return {
    kind: "request",
    path,
    name,
    seq: 1,
    data: {
      wttp: 1,
      name,
      seq: 1,
      method: "POST",
      url: "{{baseUrl}}/orders/:id",
      pathParams: [{ name: "id", value: "42", enabled: true }],
      query: [{ name: "expand", value: "items", enabled: true }],
      headers: [
        { name: "Authorization", value: "Bearer sk-live-BEARER-SECRET", enabled: true },
        { name: "Cookie", value: "cookie-SESSION-SECRET", enabled: true },
        { name: "X-Trace", value: "{{trace}}", enabled: true },
      ],
      auth: { type: "bearer", bearer: { token: "sk-live-BEARER-SECRET" } },
      body: { type: "json", json: '{"qty":1}' },
      ...extra,
    },
  };
}

function collection(requests: RequestNode[]): FolderNode {
  return {
    kind: "folder",
    path: "Shop",
    name: "Shop",
    seq: 1,
    data: {
      wttp: 1,
      name: "Shop",
      seq: 1,
      docs: "Shop API for `{{baseUrl}}`.\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    },
    children: [
      {
        kind: "folder",
        path: "Shop/Orders",
        name: "Orders",
        seq: 1,
        data: { wttp: 1, name: "Orders", seq: 1, docs: "Order endpoints." },
        children: requests,
      },
    ],
  };
}

describe("docs model", () => {
  it("orders folders before their children and skips invalid requests", () => {
    const invalid: RequestNode = {
      kind: "request",
      path: "Shop/Orders/bad.req.yaml",
      name: "bad",
      seq: 9,
      data: null,
    };
    const model = buildDocsModel(collection([request("Shop/Orders/a.req.yaml", "A"), invalid]));
    expect(flattenDocs(model).map(entry => entry.item.name)).toEqual(["Shop", "Orders", "A"]);
    expect(countRequests(model)).toBe(1);
  });

  it("gives a request without docs its minimal signature in the export", () => {
    const model = buildDocsModel(collection([request("Shop/Orders/a.req.yaml", "A")]));
    const md = renderDocsMarkdown(model);
    expect(md).toContain("`POST {{baseUrl}}/orders/:id`");
    expect(md).toContain("`expand`");
  });
});

describe("overview fields", () => {
  it("resolves the effective auth through the folder chain, never leaking `inherit`", () => {
    const root = collection([
      request("Shop/Orders/own.req.yaml", "Own"),
      request("Shop/Orders/inh.req.yaml", "Inherits", { auth: { type: "inherit" } }),
      request("Shop/Orders/off.req.yaml", "Off", { auth: { type: "none" } }),
    ]);
    root.data = { ...root.data!, auth: { type: "bearer", bearer: { token: "{{rootToken}}" } } };
    const items = flattenDocs(buildDocsModel(root)).map(entry => entry.item) as DocsRequest[];
    const [own, inherits, off] = items.slice(2);
    expect(own.authInherited).toBe(false);
    expect(inherits.effectiveAuth).toEqual({ type: "bearer", bearer: { token: "{{rootToken}}" } });
    expect(inherits.authInherited).toBe(true);
    // `none` corta a herança explicitamente.
    expect(off.effectiveAuth).toEqual({ type: "none" });
  });

  it("uses ancestor auth passed in for a nested folder", () => {
    const root = collection([
      request("Shop/Orders/a.req.yaml", "A", { auth: { type: "inherit" } }),
    ]);
    const orders = root.children[0] as FolderNode;
    const model = buildDocsModel(orders, [{ type: "bearer", bearer: { token: "{{t}}" } }]);
    expect((model.children[0] as DocsRequest).effectiveAuth.type).toBe("bearer");
  });

  it("describes bodies and omits the empty ones", () => {
    expect(describeBody({ type: "none" })).toBeNull();
    expect(describeBody({ type: "json", json: "  " })).toBeNull();
    expect(describeBody({ type: "json", json: '{"a":1}' })).toEqual({
      language: "json",
      text: '{"a":1}',
    });
    expect(
      describeBody({
        type: "urlencoded",
        urlencoded: [
          { name: "a", value: "1", enabled: true },
          { name: "b", value: "2", enabled: false },
        ],
      })?.text,
    ).toBe("a=1");
  });

  it("exports the body and param descriptions, with the inherited auth masked", () => {
    const root = collection([
      request("Shop/Orders/a.req.yaml", "A", {
        auth: { type: "inherit" },
        query: [{ name: "expand", value: "items", enabled: true, description: "Embed items" }],
      }),
    ]);
    root.data = {
      ...root.data!,
      auth: { type: "bearer", bearer: { token: "sk-live-BEARER-SECRET" } },
    };
    const model = buildDocsModel(root);
    for (const output of [renderDocsMarkdown(model), renderDocsHtml(model)]) {
      expect(output).toContain("Embed items");
      expect(output).toContain("qty");
      expect(output).not.toContain("sk-live-BEARER-SECRET");
    }
    expect(renderDocsMarkdown(model)).toContain("inherited");
  });
});

describe("export never leaks secrets", () => {
  const model = buildDocsModel(
    collection([
      request("Shop/Orders/a.req.yaml", "A"),
      request("Shop/Orders/b.req.yaml", "B", {
        auth: { type: "basic", basic: { username: "me", password: "hunter2-PASSWORD" } },
      }),
      request("Shop/Orders/c.req.yaml", "C", {
        auth: {
          type: "apikey",
          apikey: { key: "X-Key", value: "apikey-LITERAL-SECRET", in: "header" },
        },
      }),
    ]),
  );

  it.each([
    ["markdown", () => renderDocsMarkdown(model)],
    ["html", () => renderDocsHtml(model)],
  ])("%s has no literal secret values and keeps variable references", (_name, render) => {
    const output = render();
    for (const secret of SECRETS) expect(output).not.toContain(secret);
    expect(output).toContain("{{baseUrl}}");
    expect(output).toContain("{{trace}}");
  });

  it("keeps a pure {{variable}} auth value instead of masking it", () => {
    const withVar = buildDocsModel(
      collection([
        request("Shop/Orders/a.req.yaml", "A", {
          auth: { type: "bearer", bearer: { token: "{{token}}" } },
          headers: [],
        }),
      ]),
    );
    const snippet = requestSnippet(flattenDocs(withVar)[2].item as never, "curl");
    expect(snippet).toContain("{{token}}");
  });
});

describe("html export", () => {
  const model = buildDocsModel(
    collection([
      request("Shop/Orders/a.req.yaml", "A", {
        docs: "<script>alert(1)</script>\n\n[x](javascript:alert(1))",
      }),
    ]),
  );
  const html = renderDocsHtml(model);

  it("is self-contained: no external script, stylesheet or font", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import|url\(/i);
  });

  it("escapes raw html and blocks javascript: links from user docs", () => {
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain('href="javascript:');
  });

  it("has a navigable index, search and theme toggle", () => {
    expect(html).toContain('href="#doc-Shop-Orders-a-req-yaml"');
    expect(html).toContain('id="search"');
    expect(html).toContain("data-theme");
  });

  it("generates a 100-request collection in well under a few seconds", () => {
    const big = buildDocsModel(
      collection(
        Array.from({ length: 100 }, (_, i) => request(`Shop/Orders/r${i}.req.yaml`, `Req ${i}`)),
      ),
    );
    const start = performance.now();
    renderDocsHtml(big);
    renderDocsMarkdown(big);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("html export with attachments", () => {
  const withMedia = buildDocsModel(
    collection([
      request("Shop/Orders/a.req.yaml", "A", {
        docs: "![login](attachments/login-11111111.png)\n\n![demo](attachments/demo-22222222.mp4)",
      }),
    ]),
  );

  it("inlines resolved attachments as data URIs and keeps the file self-contained", () => {
    const html = renderDocsHtml(withMedia, path =>
      path.endsWith(".png") ? "data:image/png;base64,AAAA" : "data:video/mp4;base64,BBBB",
    );
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).toContain("<video controls");
    expect(html).toContain("data:video/mp4;base64,BBBB");
    expect(html).not.toContain("attachments/");
    expect(html).not.toContain("wttp-attachment:");
  });

  it("omits an attachment the resolver rejects instead of leaving a dead path", () => {
    const html = renderDocsHtml(withMedia, () => null);
    expect(html).not.toContain("<video");
    expect(html).not.toContain('src="attachments/');
    expect(html).toContain("data-attachment-omitted");
  });

  it("keeps relative attachment paths in the markdown export", () => {
    expect(renderDocsMarkdown(withMedia)).toContain("![login](attachments/login-11111111.png)");
  });
});
