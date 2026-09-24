/**
 * Reporters do `wttp run` (EP-13-T02): `cli` (legível, em tempo real), `json` (tudo, para
 * pós-processar) e `junit` (o XML que GitHub Actions, GitLab CI e Jenkins já sabem ler).
 * Puros: recebem o que o run produziu e devolvem texto.
 */

import type { RunPlanItem, RunRequestResult, RunSummary, WttpError } from "@shared";

export type ReporterName = "cli" | "json" | "junit";

export interface RunReport {
  workspace: string;
  target: string;
  environment: string | null;
  iterations: number;
  plan: RunPlanItem[];
  results: RunRequestResult[];
  summary: RunSummary;
}

// --- cli ----------------------------------------------------------------------------------

export interface CliStyle {
  color: boolean;
}

function paint(style: CliStyle, code: number, text: string): string {
  return style.color ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/** Uma linha (mais os detalhes da falha) por request terminada — escrita assim que ela termina. */
export function formatCliResult(
  result: RunRequestResult,
  style: CliStyle,
  multipleIterations: boolean,
): string {
  const mark = result.cancelled
    ? paint(style, 90, "–")
    : result.passed
      ? paint(style, 32, "✓")
      : paint(style, 31, "✗");
  const iteration = multipleIterations ? paint(style, 90, `#${result.iteration} `) : "";
  const status = result.cancelled ? "cancelled" : (result.status ?? "ERR");
  const tests = result.assertions.length
    ? ` ${paint(style, 90, `(${result.assertions.filter(a => a.passed).length}/${result.assertions.length} tests)`)}`
    : "";
  const lines = [
    `${mark} ${iteration}${result.method.padEnd(6)} ${result.name}  ${status} ${paint(style, 90, formatMs(result.durationMs))}${tests}`,
  ];
  if (result.error) {
    const source = result.error.source ? `${result.error.source}: ` : "";
    lines.push(
      `    ${paint(style, 31, `${source}${result.error.error.code} ${result.error.error.message}`)}`,
    );
  }
  for (const assertion of result.assertions.filter(a => !a.passed)) {
    lines.push(
      `    ${paint(style, 31, `✗ ${assertion.name}`)}${assertion.message ? ` — ${assertion.message}` : ""}`,
    );
  }
  if (result.unresolved.length) {
    lines.push(
      `    ${paint(style, 33, `unresolved variables sent as-is: ${result.unresolved.join(", ")}`)}`,
    );
  }
  return lines.join("\n");
}

export function formatCliSummary(summary: RunSummary, style: CliStyle): string {
  const failed = summary.failed > 0 ? paint(style, 31, `${summary.failed} failed`) : "0 failed";
  const lines = [
    "",
    `${summary.total} requests: ${paint(style, 32, `${summary.passed} passed`)}, ${failed}` +
      ` · ${summary.assertions.passed}/${summary.assertions.total} assertions · ${formatMs(summary.durationMs)}`,
  ];
  if (summary.endedEarly === "bail")
    lines.push(paint(style, 33, "Stopped at the first failure (--bail)."));
  if (summary.endedEarly === "stopped") lines.push(paint(style, 33, "Run interrupted."));
  return lines.join("\n");
}

export function formatCliError(error: WttpError, style: CliStyle): string {
  return paint(style, 31, `wttp: ${error.message}${error.detail ? ` (${error.detail})` : ""}`);
}

// --- json ---------------------------------------------------------------------------------

export function formatJson(report: RunReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

// --- junit --------------------------------------------------------------------------------

function xml(value: string): string {
  return (
    value
      // Caracteres de controle não são XML 1.0 válido — o parser do CI rejeitaria o arquivo.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * Uma `<testsuite>` por request executada (por iteração), um `<testcase>` por asserção —
 * o formato do newman, que os CIs mostram como "suite › teste". Request sem asserção vira
 * um testcase único, que falha se a request falhou (erro de rede, pre-request).
 */
export function formatJunit(report: RunReport): string {
  const multipleIterations = report.iterations > 1;
  const suites = report.results
    .filter(result => !result.cancelled)
    .map(result => {
      const suiteName = `${result.path}${multipleIterations ? ` [iteration ${result.iteration}]` : ""}`;
      const classname = xml(result.path.replace(/\.req\.yaml$/, "").replace(/\//g, "."));
      const cases: string[] = [];
      let failures = 0;
      let errors = 0;

      if (result.error) {
        errors++;
        const where = result.error.source ? `${result.error.source}: ` : "";
        cases.push(
          `    <testcase name="${xml(`${result.method} ${result.name}`)}" classname="${classname}" time="${seconds(result.durationMs)}">\n` +
            `      <error type="${xml(result.error.error.code)}" message="${xml(`${where}${result.error.error.message}`)}"/>\n` +
            `    </testcase>`,
        );
      }
      for (const assertion of result.assertions) {
        const name = xml(
          `${assertion.name}${assertion.source !== "This request" ? ` (${assertion.source})` : ""}`,
        );
        const time = seconds(assertion.durationMs);
        if (assertion.passed) {
          cases.push(`    <testcase name="${name}" classname="${classname}" time="${time}"/>`);
        } else {
          failures++;
          cases.push(
            `    <testcase name="${name}" classname="${classname}" time="${time}">\n` +
              `      <failure type="AssertionFailure" message="${xml(assertion.message ?? "assertion failed")}"/>\n` +
              `    </testcase>`,
          );
        }
      }
      if (cases.length === 0) {
        cases.push(
          `    <testcase name="${xml(`${result.method} ${result.name}`)}" classname="${classname}" time="${seconds(result.durationMs)}"/>`,
        );
      }

      const tests = cases.length;
      return (
        `  <testsuite name="${xml(suiteName)}" tests="${tests}" failures="${failures}" errors="${errors}" time="${seconds(result.durationMs)}">\n` +
        `${cases.join("\n")}\n` +
        `  </testsuite>`
      );
    });

  const totals = report.results
    .filter(result => !result.cancelled)
    .reduce(
      (acc, result) => {
        const assertionCases = result.assertions.length;
        acc.tests += Math.max(1, assertionCases + (result.error ? 1 : 0));
        acc.failures += result.assertions.filter(a => !a.passed).length;
        acc.errors += result.error ? 1 : 0;
        return acc;
      },
      { tests: 0, failures: 0, errors: 0 },
    );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<testsuites name="${xml(`wttp run ${report.target || report.workspace}`)}" tests="${totals.tests}" failures="${totals.failures}" errors="${totals.errors}" time="${seconds(report.summary.durationMs)}">\n` +
    `${suites.join("\n")}${suites.length ? "\n" : ""}` +
    `</testsuites>\n`
  );
}
