/* eslint-disable @typescript-eslint/explicit-function-return-type -- script .mjs sem TypeScript; não há onde anotar o tipo de retorno. */
// Smoke test do CLI empacotado (EP-13-T02): roda `cli/dist/wttp.mjs` como o CI rodaria —
// Node puro, sem Electron e sem DISPLAY — contra uma cópia de `examples/postman-echo-demo`
// apontada para um servidor local que imita o postman-echo.com (sem rede externa).
// Confere o exit code em sucesso (0), em falha (1) e em uso errado (2), e que o JUnit
// gerado é XML bem formado com as contagens certas. Pré-requisito: `yarn build:cli`.
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const bin = join(root, "cli", "dist", "wttp.mjs");

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://localhost");
    const body = Buffer.concat(chunks).toString();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
    const expectedBasic = `Basic ${Buffer.from("postman:password").toString("base64")}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        args: Object.fromEntries(url.searchParams),
        headers: req.headers,
        json,
        authenticated: req.headers.authorization === expectedBasic,
      }),
    );
  });
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;

const dir = mkdtempSync(join(tmpdir(), "wttp-cli-smoke-"));
const workspace = join(dir, "demo");
cpSync(join(root, "examples", "postman-echo-demo"), workspace, { recursive: true });

// Sem DISPLAY/WAYLAND_DISPLAY, como num container de CI.
const env = { ...process.env, NO_COLOR: "1" };
delete env.DISPLAY;
delete env.WAYLAND_DISPLAY;
delete env.ELECTRON_RUN_AS_NODE;

// Assíncrono de propósito: o servidor acima roda neste mesmo processo, e um
// `spawnSync` travaria o event loop dele — toda request do CLI daria timeout.
function wttp(args) {
  return new Promise(done => {
    const child = spawn(process.execPath, [bin, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    child.on("close", code => done({ code, stdout, stderr }));
  });
}

let failures = 0;
function check(label, condition, detail = "") {
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
  if (!condition) {
    failures++;
    if (detail) console.log(detail);
  }
}

try {
  const report = join(dir, "report.xml");
  const pass = await wttp([
    "run",
    workspace,
    "--env",
    "demo",
    "--var",
    `base_url=${base}`,
    "-r",
    "cli,junit",
    "-o",
    report,
  ]);
  check("all requests pass → exit 0", pass.code === 0, pass.stdout + pass.stderr);
  check(
    "cli reporter prints the summary",
    /5 requests: 5 passed, 0 failed/.test(pass.stdout),
    pass.stdout,
  );

  const xml = readFileSync(report, "utf-8");
  check(
    "junit is well-formed XML",
    /^<\?xml version="1.0" encoding="UTF-8"\?>\n<testsuites /.test(xml),
  );
  check("junit has one testsuite per request", (xml.match(/<testsuite /g) ?? []).length === 5, xml);
  check(
    "junit counts 9 testcases, no failures",
    /<testsuites [^>]*tests="9" failures="0" errors="0"/.test(xml),
    xml,
  );
  const opens = (xml.match(/<(testsuites|testsuite|testcase)[ >]/g) ?? []).length;
  const closes = (xml.match(/<\/(testsuites|testsuite|testcase)>|\/>/g) ?? []).length;
  check("junit tags are balanced", opens === closes, `${opens} opened, ${closes} closed`);

  // Falha: o endpoint de Basic auth recusa as credenciais trocadas.
  const fail = await wttp([
    "run",
    join(workspace, "auth-flow"),
    "--env",
    "demo",
    "--var",
    `base_url=${base}`,
    "--var",
    "password=wrong",
  ]);
  check("a failing test → exit 1", fail.code === 1, fail.stdout + fail.stderr);
  check(
    "failure is reported with the assertion",
    /✗ server confirms authentication/.test(fail.stdout),
    fail.stdout,
  );

  const json = await wttp([
    "run",
    join(workspace, "basics"),
    "--var",
    `base_url=${base}`,
    "-r",
    "json",
  ]);
  const parsed = JSON.parse(json.stdout);
  check(
    "json reporter on stdout parses and has the summary",
    parsed.summary.total === 2 && json.code === 0,
    json.stdout,
  );

  check("unknown option → exit 2", (await wttp(["run", workspace, "--nope"])).code === 2);
  check(
    "missing environment → exit 2",
    (await wttp(["run", workspace, "--env", "nope"])).code === 2,
  );
  check("not a workspace → exit 2", (await wttp(["run", dir])).code === 2);
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\ncli smoke: all checks passed");
