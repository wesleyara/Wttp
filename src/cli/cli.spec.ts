import type { FolderNode, RequestFile, RequestNode, RunRequestResult } from "@shared";
import type { Server } from "node:http";

import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cancelHttpRequest, sendHttpRequest } from "../main/http/engine";
import { executeScript } from "../main/scripts/api";
import {
  createEnvironment,
  createNode,
  initWorkspace,
  writeEnvironment,
  writeNode,
} from "../main/storage/tree";
import { type CliIo, EXIT_FAILED, EXIT_OK, EXIT_USAGE, runCli, secretEnvName } from "./cli";
import { formatJunit, type RunReport } from "./reporters";

let server: Server;
let baseUrl: string;
const seen: { url: string; key?: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", key: req.headers["x-api-key"] as string | undefined });
    const status = req.url?.startsWith("/fail") ? 500 : 200;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: status === 200 }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

let root: string;
let written: Record<string, string>;

beforeEach(async () => {
  seen.length = 0;
  written = {};
  root = await mkdtemp(join(tmpdir(), "wttp-cli-"));
  await initWorkspace(root, "CLI");
  const env = await createEnvironment(root, "CI");
  await writeEnvironment(root, env.path, {
    ...env.data,
    variables: [
      { name: "base", value: "http://wrong.invalid", enabled: true },
      { name: "apiKey", value: "", enabled: true, secret: true },
    ],
  });
  const folder = (await createNode(root, "", "folder", "API")) as FolderNode;
  const add = async (name: string, data: Partial<RequestFile>): Promise<void> => {
    const node = (await createNode(root, folder.path, "request", name)) as RequestNode;
    await writeNode(root, node.path, { ...node, data: { ...node.data!, ...data } });
  };
  await add("Ok", {
    url: "{{base}}/ok",
    headers: [{ name: "X-Api-Key", value: "{{apiKey}}", enabled: true }],
    scripts: { tests: 'test("is 200", () => expect(res.status).toBe(200));' },
  });
  await add("Fails", {
    url: "{{base}}/fail",
    scripts: { tests: 'test("is 200", () => expect(res.status).toBe(200));' },
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function io(env: Record<string, string> = {}): CliIo & { out: string; err: string } {
  const result = {
    out: "",
    err: "",
    stdout: (text: string) => void (result.out += text),
    stderr: (text: string) => void (result.err += text),
    env,
    cwd: root,
    color: false,
    deps: {
      send: sendHttpRequest,
      cancel: (id: string) => void cancelHttpRequest(id),
      runScript: async (spec: Parameters<typeof executeScript>[0]) => executeScript(spec),
    },
    writeFile: async (path: string, contents: string) => void (written[path] = contents),
    version: "9.9.9",
  };
  return result;
}

describe("secretEnvName", () => {
  it("upper-cases and replaces anything outside A-Z/0-9 with _", () => {
    expect(secretEnvName("apiKey")).toBe("WTTP_SECRET_APIKEY");
    expect(secretEnvName("client-secret.v2")).toBe("WTTP_SECRET_CLIENT_SECRET_V2");
  });
});

describe("runCli (EP-13-T02)", () => {
  it("prints help and version with exit 0", async () => {
    const help = io();
    expect(await runCli(["--help"], help)).toBe(EXIT_OK);
    expect(help.out).toContain("Usage: wttp run <path>");
    const version = io();
    expect(await runCli(["-v"], version)).toBe(EXIT_OK);
    expect(version.out).toBe("9.9.9\n");
  });

  it.each([
    [["build"], "unknown command"],
    [["run"], "missing <path>"],
    [["run", ".", "--reporter", "xml"], "unknown reporter"],
    [["run", ".", "-r", "json,junit"], "only one of json/junit"],
    [["run", ".", "--out", "x.xml"], "--out needs the json or junit reporter"],
    [["run", ".", "--iterations", "0"], "--iterations must be an integer"],
    [["run", ".", "--var", "novalue"], "--var expects name=value"],
    [["run", ".", "--nope"], "Unknown option"],
  ])("rejects %j with exit 2", async (argv, message) => {
    const out = io();
    expect(await runCli(argv, out)).toBe(EXIT_USAGE);
    expect(out.err).toContain(message);
  });

  it("finds the workspace from a folder inside it, uses env secrets and --var, exits 1 on a failure", async () => {
    const out = io({ WTTP_SECRET_APIKEY: "from-env" });
    const code = await runCli(["run", "api", "--env", "CI", "--var", `base=${baseUrl}`], out);

    expect(code).toBe(EXIT_FAILED);
    expect(seen).toEqual([
      { url: "/ok", key: "from-env" },
      { url: "/fail", key: undefined },
    ]);
    expect(out.out).toContain("wttp run api  ·  2 requests  ·  env CI");
    expect(out.out).toContain("✓ GET    Ok  200");
    expect(out.out).toContain("✗ is 200 — expected 500 to be 200");
    expect(out.out).toContain("2 requests: 1 passed, 1 failed");
  });

  it("warns about secrets with no environment variable", async () => {
    const out = io();
    await runCli(["run", ".", "--env", "CI", "--var", `base=${baseUrl}`], out);
    expect(out.out).toContain(
      "warning: secret variables without a value: apiKey (WTTP_SECRET_APIKEY)",
    );
  });

  it("exits 0 when everything passes, and --bail stops at the first failure", async () => {
    const passing = io();
    const selection = await runCli(
      ["run", ".", "--var", `base=${baseUrl}`, "--iterations", "2", "--bail"],
      passing,
    );
    expect(selection).toBe(EXIT_FAILED);
    expect(seen.map(hit => hit.url)).toEqual(["/ok", "/fail"]);
    expect(passing.out).toContain("Stopped at the first failure (--bail).");
  });

  it("writes junit to --out and keeps the human report on stdout", async () => {
    const out = io();
    await runCli(
      ["run", ".", "--var", `base=${baseUrl}`, "-r", "cli,junit", "-o", "report.xml"],
      out,
    );
    const xml = written[join(root, "report.xml")];
    expect(xml).toContain('<testsuites name="wttp run ');
    expect(xml).toContain('tests="2" failures="1" errors="0"');
    expect(out.out).toContain("2 requests:");
  });

  it("puts json on stdout and moves the human report to stderr when both share the terminal", async () => {
    const out = io();
    await runCli(["run", ".", "--var", `base=${baseUrl}`, "-r", "cli", "-r", "json"], out);
    const report = JSON.parse(out.out) as { summary: { total: number } };
    expect(report.summary.total).toBe(2);
    expect(out.err).toContain("2 requests:");
  });

  it("reports an unknown environment and a path outside any workspace with exit 2", async () => {
    const env = io();
    expect(await runCli(["run", ".", "--env", "prod"], env)).toBe(EXIT_USAGE);
    expect(env.err).toContain('environment "prod" not found (available: CI)');

    const outside = io();
    expect(await runCli(["run", tmpdir()], outside)).toBe(EXIT_USAGE);
    expect(outside.err).toContain("not inside a Wttp workspace");
  });
});

describe("secret masking (EP-13-T03)", () => {
  it("never prints a secret value, even when a script logs it or it lands in the URL", async () => {
    const env = await import("../main/storage/tree").then(m => m.listEnvironments(root));
    const folder = (await import("../main/storage/tree").then(m =>
      m.readNode(root, "api"),
    )) as FolderNode;
    const leaky = (await createNode(root, folder.path, "request", "Leaky")) as RequestNode;
    await writeNode(root, leaky.path, {
      ...leaky,
      data: {
        ...leaky.data!,
        url: "{{base}}/ok",
        query: [{ name: "key", value: "{{apiKey}}", enabled: true }],
        scripts: {
          tests:
            'console.log("key is " + req.url);\ntest("never " + "s3cr3t-value", () => expect(1).toBe(2));',
        },
      },
    });
    expect(env[0].data.name).toBe("CI");

    const out = io({ WTTP_SECRET_APIKEY: "s3cr3t-value" });
    await runCli(
      ["run", ".", "--env", "CI", "--var", `base=${baseUrl}`, "-r", "cli,json", "-o", "r.json"],
      out,
    );

    expect(seen.some(hit => hit.url.includes("s3cr3t-value"))).toBe(true);
    expect(out.out + out.err).not.toContain("s3cr3t-value");
    expect(written[join(root, "r.json")]).not.toContain("s3cr3t-value");
    expect(written[join(root, "r.json")]).toContain("key=****");
  });
});

describe("formatJunit", () => {
  function result(overrides: Partial<RunRequestResult>): RunRequestResult {
    return {
      iteration: 1,
      index: 0,
      path: "api/users/list.req.yaml",
      name: "List",
      method: "GET",
      url: "http://x",
      status: 200,
      durationMs: 1234,
      passed: true,
      cancelled: false,
      assertions: [],
      console: [],
      unresolved: [],
      ...overrides,
    };
  }

  function report(results: RunRequestResult[]): RunReport {
    return {
      workspace: "/ws",
      target: "api",
      environment: null,
      iterations: 1,
      plan: [],
      results,
      summary: {
        total: results.length,
        passed: 0,
        failed: 0,
        assertions: { total: 0, passed: 0, failed: 0 },
        durationMs: 2000,
        endedEarly: null,
      },
    };
  }

  it("escapes XML and strips control characters", () => {
    const xml = formatJunit(
      report([
        result({
          assertions: [
            {
              name: `<b>"quoted" & 'single'</b>`,
              passed: false,
              message: "bad\u0007 value < 3",
              durationMs: 5,
              source: "This request",
            },
          ],
        }),
      ]),
    );
    expect(xml).toContain('name="&lt;b&gt;&quot;quoted&quot; &amp; &apos;single&apos;&lt;/b&gt;"');
    expect(xml).toContain('message="bad value &lt; 3"');
    expect(xml).not.toContain("\u0007");
  });

  it("maps a request with no tests to one testcase, and a network error to <error>", () => {
    const xml = formatJunit(
      report([
        result({}),
        result({
          index: 1,
          name: "Down",
          status: null,
          passed: false,
          error: { error: { code: "CONNECTION_REFUSED", message: "refused" } },
        }),
      ]),
    );
    expect(xml).toContain(
      '<testsuites name="wttp run api" tests="2" failures="0" errors="1" time="2.000">',
    );
    expect(xml).toContain('classname="api.users.list" time="1.234"/>');
    expect(xml).toContain('<error type="CONNECTION_REFUSED" message="refused"/>');
  });

  it("leaves cancelled requests out", () => {
    expect(formatJunit(report([result({ cancelled: true })]))).toContain('tests="0"');
  });
});
