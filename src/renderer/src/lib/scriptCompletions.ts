/**
 * Autocomplete da API de scripting (EP-09-T04) — arch-docs/scripting.md. `WCodeEditor`
 * (`scriptPhase` prop) usa isto quando edita `scripts.preRequest`/`scripts.tests`.
 * Pura: só monta a fonte de completions do CodeMirror, sem tocar em `window.wttp`.
 */

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { ScriptPhase } from "@shared";

import { snippetCompletion } from "@codemirror/autocomplete";

interface ApiMember {
  label: string;
  type: "method" | "property";
  info: string;
  /** Só métodos: insere o `(` junto, deixando o cursor pronto para o argumento. */
  apply?: string;
}

const WTTP_MEMBERS: ApiMember[] = [
  {
    label: "setVar",
    type: "method",
    info: "wttp.setVar(name, value) — set a variable in the active environment",
    apply: "setVar(",
  },
  {
    label: "getVar",
    type: "method",
    info: "wttp.getVar(name) — read a variable from the active environment",
    apply: "getVar(",
  },
  {
    label: "setCollectionVar",
    type: "method",
    info: "wttp.setCollectionVar(name, value) — set a variable in this request's collection",
    apply: "setCollectionVar(",
  },
  {
    label: "getCollectionVar",
    type: "method",
    info: "wttp.getCollectionVar(name) — read a variable from this request's collection",
    apply: "getCollectionVar(",
  },
];

const CONSOLE_MEMBERS: ApiMember[] = [
  {
    label: "log",
    type: "method",
    info: "console.log(...) — shown in the scripts console",
    apply: "log(",
  },
  { label: "warn", type: "method", info: "console.warn(...)", apply: "warn(" },
  { label: "error", type: "method", info: "console.error(...)", apply: "error(" },
];

const REQ_MEMBERS: ApiMember[] = [
  { label: "method", type: "property", info: "req.method — HTTP method" },
  { label: "url", type: "property", info: "req.url — already resolved, no {{var}} left" },
  { label: "query", type: "property", info: "req.query — [{ name, value, enabled }]" },
  { label: "headers", type: "property", info: "req.headers — [{ name, value, enabled }]" },
  { label: "auth", type: "property", info: "req.auth" },
  { label: "body", type: "property", info: "req.body" },
];

const RES_MEMBERS: ApiMember[] = [
  {
    label: "ok",
    type: "property",
    info: "res.ok — false when the request itself failed (network/DNS/TLS/timeout)",
  },
  { label: "status", type: "property", info: "res.status — HTTP status code" },
  { label: "statusText", type: "property", info: "res.statusText" },
  { label: "headers", type: "property", info: "res.headers — { [name]: value }" },
  { label: "body", type: "property", info: "res.body — response body decoded as text" },
  { label: "json", type: "property", info: "res.json — body parsed as JSON, or undefined" },
  {
    label: "size",
    type: "property",
    info: "res.size — { headersSent, bodySent, headersReceived, bodyReceived }",
  },
  {
    label: "timing",
    type: "property",
    info: "res.timing — { dns, connect, tls, ttfb, download, total } in ms",
  },
];

const EXPECT_MATCHERS: ApiMember[] = [
  { label: "toBe", type: "method", info: "expect(actual).toBe(expected)", apply: "toBe(" },
  { label: "toEqual", type: "method", info: "expect(actual).toEqual(expected)", apply: "toEqual(" },
  {
    label: "toBeTruthy",
    type: "method",
    info: "expect(actual).toBeTruthy()",
    apply: "toBeTruthy(",
  },
  {
    label: "toContain",
    type: "method",
    info: "expect(actual).toContain(item)",
    apply: "toContain(",
  },
  {
    label: "toHaveProperty",
    type: "method",
    info: "expect(actual).toHaveProperty(path, value?)",
    apply: "toHaveProperty(",
  },
  {
    label: "toMatch",
    type: "method",
    info: "expect(actual).toMatch(regexOrString)",
    apply: "toMatch(",
  },
];

const MEMBERS_BY_OBJECT: Record<string, ApiMember[]> = {
  wttp: WTTP_MEMBERS,
  console: CONSOLE_MEMBERS,
  req: REQ_MEMBERS,
  res: RES_MEMBERS,
};

/** Só o que existe na fase — `req`/`console` no pre-request; `res`/`test`/`expect`/`console` nos tests (arch-docs/scripting.md). */
function topLevelNamesFor(phase: ScriptPhase): string[] {
  return phase === "preRequest"
    ? ["wttp", "req", "console"]
    : ["wttp", "res", "test", "expect", "console"];
}

/** Padrões comuns (EP-09-T04) — `Tab` pula entre os `${...}` até o fim do snippet. */
function snippetsFor(phase: ScriptPhase): Completion[] {
  if (phase === "preRequest") {
    return [
      snippetCompletion('wttp.setVar("${name}", ${value});', {
        label: "set-var",
        type: "text",
        info: "Save a variable to the active environment",
      }),
    ];
  }
  return [
    snippetCompletion('test("status ${200}", () => expect(res.status).toBe(${200}));', {
      label: "test-status",
      type: "text",
      info: "Assert the response status code",
    }),
    snippetCompletion(
      'test("has ${token}", () => expect(res.json.${token}).toBeTruthy());\nwttp.setVar("${token}", res.json.${token});',
      {
        label: "save-token",
        type: "text",
        info: "Assert a token is present and save it to the active environment",
      },
    ),
  ];
}

function toOptions(
  members: ApiMember[],
): { label: string; type: string; info: string; apply?: string }[] {
  return members.map(member => ({
    label: member.label,
    type: member.type,
    info: member.info,
    apply: member.apply,
  }));
}

export function scriptApiCompletionSource(phase: ScriptPhase) {
  const topLevelNames = topLevelNamesFor(phase);

  return (context: CompletionContext): CompletionResult | null => {
    // `wttp.`, `req.`, `res.`, `console.` — completions de membro.
    const member = context.matchBefore(/(wttp|req|res|console)\.[\w$]*/);
    if (member) {
      const dot = member.text.indexOf(".");
      const objectName = member.text.slice(0, dot);
      const members = MEMBERS_BY_OBJECT[objectName];
      if (!members || !topLevelNames.includes(objectName)) return null;
      return {
        from: member.from + dot + 1,
        options: toOptions(members),
        validFor: /^[\w$]*$/,
      };
    }

    // `expect(res.status).` — os matchers vêm depois de um `)`, não de um identificador.
    if (phase === "tests") {
      const chained = context.matchBefore(/\)\.[\w$]*/);
      if (chained) {
        return {
          from: chained.from + 2,
          options: toOptions(EXPECT_MATCHERS),
          validFor: /^[\w$]*$/,
        };
      }
    }

    // Identificador solto no topo — sugere os globals e os snippets de padrão comum desta fase.
    const word = context.matchBefore(/[\w$]+/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return {
      from: word.from,
      options: [
        ...topLevelNames.map(name => ({ label: name, type: "keyword" })),
        ...snippetsFor(phase),
      ],
      validFor: /^[\w$]*$/,
    };
  };
}
