import { describe, expect, it } from "vitest";

import { type CurlRequest, shellQuote, toCurl } from "./curl";

function request(overrides: Partial<CurlRequest> = {}): CurlRequest {
  return {
    method: "GET",
    url: "https://api.example.com/users",
    query: [],
    headers: [],
    auth: { type: "none" },
    body: { type: "none" },
    ...overrides,
  };
}

describe("shellQuote", () => {
  it("wraps in single quotes and escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it("keeps $, backslashes, double quotes and newlines literal", () => {
    expect(shellQuote('a $HOME \\n "x"\nline 2')).toBe(`'a $HOME \\n "x"\nline 2'`);
  });
});

describe("toCurl", () => {
  it("emits a plain GET without --request", () => {
    expect(toCurl(request())).toBe("curl --location 'https://api.example.com/users'");
  });

  it("uses the query table as the source of truth, dropping the query embedded in the url", () => {
    const command = toCurl(
      request({
        url: "https://api.example.com/users?page=1",
        query: [
          { name: "page", value: "1", enabled: true },
          { name: "size", value: "10 20", enabled: true },
          { name: "off", value: "x", enabled: false },
        ],
      }),
    );
    expect(command).toBe("curl --location 'https://api.example.com/users?page=1&size=10+20'");
  });

  it("emits enabled headers only, and an empty header value with the `Name;` syntax", () => {
    const command = toCurl(
      request({
        headers: [
          { name: "X-Trace", value: "abc", enabled: true },
          { name: "X-Off", value: "no", enabled: false },
          { name: "X-Empty", value: "", enabled: true },
        ],
      }),
    );
    expect(command).toBe(
      [
        "curl --location 'https://api.example.com/users'",
        "--header 'X-Trace: abc'",
        "--header 'X-Empty;'",
      ].join(" \\\n  "),
    );
  });

  it("escapes a multiline JSON body with single quotes", () => {
    const json = `{\n  "name": "O'Brien",\n  "note": "$HOME"\n}`;
    const command = toCurl(request({ method: "POST", body: { type: "json", json } }));
    expect(command).toBe(
      [
        "curl --location --request POST 'https://api.example.com/users'",
        "--header 'Content-Type: application/json'",
        `--data-raw '{\n  "name": "O'\\''Brien",\n  "note": "$HOME"\n}'`,
      ].join(" \\\n  "),
    );
  });

  it("keeps a Content-Type the user already set instead of adding the default", () => {
    const command = toCurl(
      request({
        method: "POST",
        headers: [{ name: "content-type", value: "application/vnd.api+json", enabled: true }],
        body: { type: "json", json: "{}" },
      }),
    );
    expect(command).not.toContain("application/json'");
    expect(command).toContain("--header 'content-type: application/vnd.api+json'");
  });

  it("encodes urlencoded bodies exactly like the engine (URLSearchParams)", () => {
    const command = toCurl(
      request({
        method: "POST",
        body: {
          type: "urlencoded",
          urlencoded: [
            { name: "q", value: "a b&c", enabled: true },
            { name: "skip", value: "1", enabled: false },
          ],
        },
      }),
    );
    expect(command).toContain("--header 'Content-Type: application/x-www-form-urlencoded'");
    expect(command).toContain("--data-raw 'q=a+b%26c'");
  });

  it("uses --form-string for text parts and --form @path for files", () => {
    const command = toCurl(
      request({
        method: "POST",
        body: {
          type: "multipart",
          multipart: [
            { name: "title", type: "text", value: "@not-a-file;type=x", enabled: true },
            { name: "file", type: "file", value: "/tmp/report.pdf", enabled: true },
            { name: "odd", type: "file", value: "/tmp/a;b.txt", enabled: true },
          ],
        },
      }),
    );
    expect(command).toContain("--form-string 'title=@not-a-file;type=x'");
    expect(command).toContain("--form 'file=@/tmp/report.pdf'");
    expect(command).toContain(`--form 'odd=@"/tmp/a;b.txt"'`);
    expect(command).not.toContain("Content-Type");
  });

  it("sends a binary body from the file path with the engine's default Content-Type", () => {
    const command = toCurl(
      request({ method: "PUT", body: { type: "binary", binary: "/tmp/blob.bin" } }),
    );
    expect(command).toContain("--header 'Content-Type: application/octet-stream'");
    expect(command).toContain("--data-binary '@/tmp/blob.bin'");
  });

  it("suppresses curl's default Content-Type for a raw body without one", () => {
    const command = toCurl(
      request({ method: "POST", body: { type: "raw", raw: "hello", contentType: "" } }),
    );
    expect(command).toContain("--header 'Content-Type:'");
  });

  it("uses --head for HEAD and --request for a GET that carries a body", () => {
    expect(toCurl(request({ method: "HEAD" }))).toBe(
      "curl --location --head 'https://api.example.com/users'",
    );
    expect(toCurl(request({ body: { type: "json", json: "{}" } }))).toContain("--request GET");
  });

  describe("auth and secrets", () => {
    it("masks bearer, basic password and api key value by default", () => {
      expect(toCurl(request({ auth: { type: "bearer", bearer: { token: "tkn-123" } } }))).toContain(
        "--header 'Authorization: Bearer ****'",
      );
      expect(
        toCurl(
          request({ auth: { type: "basic", basic: { username: "admin", password: "s3cr3t" } } }),
        ),
      ).toContain("--user 'admin:****'");
      expect(
        toCurl(
          request({
            auth: { type: "apikey", apikey: { key: "X-Api-Key", value: "k", in: "header" } },
          }),
        ),
      ).toContain("--header 'X-Api-Key: ****'");
    });

    it("copies the real values with maskSecrets: false", () => {
      const command = toCurl(request({ auth: { type: "bearer", bearer: { token: "tkn-123" } } }), {
        maskSecrets: false,
      });
      expect(command).toContain("--header 'Authorization: Bearer tkn-123'");
    });

    it("puts a query api key in the url", () => {
      const command = toCurl(
        request({
          auth: { type: "apikey", apikey: { key: "api_key", value: "k1", in: "query" } },
        }),
        { maskSecrets: false },
      );
      expect(command).toBe("curl --location 'https://api.example.com/users?api_key=k1'");
    });

    it("lets a manual Authorization header win over bearer/basic, like applyAuth", () => {
      const command = toCurl(
        request({
          headers: [{ name: "Authorization", value: "Token manual", enabled: true }],
          auth: { type: "bearer", bearer: { token: "ignored" } },
        }),
      );
      expect(command).toContain("--header 'Authorization: Token manual'");
      expect(command).not.toContain("Bearer");
    });

    it("treats inherit as none", () => {
      expect(toCurl(request({ auth: { type: "inherit" } }))).toBe(
        "curl --location 'https://api.example.com/users'",
      );
    });

    it("masks every occurrence of a secret variable value, anywhere in the command", () => {
      const command = toCurl(
        request({
          method: "POST",
          url: "https://api.example.com/users/topsecret",
          query: [{ name: "sig", value: "topsecret", enabled: true }],
          headers: [{ name: "X-Token", value: "Bearer topsecret", enabled: true }],
          body: { type: "json", json: '{"password":"topsecret"}' },
        }),
        { secrets: ["topsecret"] },
      );
      expect(command).not.toContain("topsecret");
      expect(command).toContain("/users/****?sig=****");
      expect(command).toContain("--header 'X-Token: Bearer ****'");
      expect(command).toContain(`--data-raw '{"password":"****"}'`);
    });

    it("does not mask secrets with maskSecrets: false", () => {
      const command = toCurl(
        request({ headers: [{ name: "X-Token", value: "topsecret", enabled: true }] }),
        { maskSecrets: false, secrets: ["topsecret"] },
      );
      expect(command).toContain("X-Token: topsecret");
    });
  });

  describe("unresolved variables", () => {
    it("keeps {{var}} literal in path and query, with --globoff", () => {
      const command = toCurl(
        request({
          url: "https://api.example.com/users/{{userId}}",
          query: [{ name: "v", value: "{{version}}", enabled: true }],
        }),
      );
      expect(command).toBe(
        "curl --location --globoff 'https://api.example.com/users/{{userId}}?v={{version}}'",
      );
    });

    it("keeps an unresolved base url literal even though it is not a valid URL", () => {
      const command = toCurl(
        request({
          url: "{{baseUrl}}/users?old=1",
          query: [{ name: "a", value: "1", enabled: true }],
        }),
      );
      expect(command).toBe("curl --location --globoff '{{baseUrl}}/users?a=1'");
    });
  });
});
