import type { Locator, Page } from "@playwright/test";

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

import { expect, test } from "./fixtures";
import { createWorkspace, fillCodeMirror, saveActiveTab, seedWorkspacesRoot } from "./helpers";

interface Backend {
  server: Server;
  base: string;
}

/** Servidor local: login, criar/buscar usuário (com token) e um job que termina na 3ª consulta. */
async function startBackend(): Promise<Backend> {
  let jobCalls = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const authorized = req.headers.authorization === "Bearer tkn-42";
      const json = (status: number, body: unknown, headers: Record<string, string> = {}): void => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(body));
      };
      const url = req.url ?? "";
      if (url === "/login") json(200, { data: { token: "tkn-42" } });
      else if (url === "/users" && req.method === "POST") {
        if (authorized) json(201, { id: 7 }, { location: "/users/7" });
        else json(401, {});
      } else if (url === "/users/7") {
        if (authorized) json(200, { id: 7, name: "Ada" });
        else json(401, {});
      } else if (url.startsWith("/job")) {
        jobCalls++;
        json(200, { job: { state: jobCalls >= 3 ? "done" : "pending" } });
      } else if (url === "/ok") json(200, { ok: true });
      else json(404, {});
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    server,
    base: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
  };
}

async function stopBackend(backend: Backend): Promise<void> {
  backend.server.closeAllConnections();
  await new Promise<void>(resolve => backend.server.close(() => resolve()));
}

function workspaceRoot(workspacesRoot: string): string {
  const container = join(workspacesRoot, "wttp");
  return join(container, readdirSync(container)[0]);
}

function writeRequests(root: string, base: string): void {
  mkdirSync(join(root, "api"), { recursive: true });
  writeFileSync(join(root, "api", "folder.yaml"), "wttp: 1\nname: API\nseq: 1\n");
  const write = (file: string, body: string): void =>
    writeFileSync(join(root, "api", file), `wttp: 1\n${body}`);
  write("login.req.yaml", `name: Login\nseq: 1\nmethod: POST\nurl: "${base}/login"\n`);
  write(
    "create-user.req.yaml",
    `name: Create user\nseq: 2\nmethod: POST\nurl: "${base}/users"\nauth: { type: bearer, bearer: { token: "{{token}}" } }\n`,
  );
  write(
    "get-user.req.yaml",
    `name: Get user\nseq: 3\nmethod: GET\nurl: "${base}/users/{{user_id}}"\nauth: { type: bearer, bearer: { token: "{{token}}" } }\n`,
  );
  write("job.req.yaml", `name: Job\nseq: 4\nmethod: GET\nurl: "${base}/job"\n`);
  write("ok.req.yaml", `name: Ok\nseq: 5\nmethod: GET\nurl: "${base}/ok"\n`);
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Arrasta com o mouse de verdade, em passos — os handlers de ponteiro do app não veem um salto. */
async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 4, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function openFlowTree(page: Page): Promise<void> {
  await expect(page.getByRole("treeitem").filter({ hasText: "API" })).toBeVisible();
  await page.getByRole("treeitem").filter({ hasText: "API" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("treeitem").filter({ hasText: "Login" })).toBeVisible();
}

const flowNode = (page: Page, id: string): Locator =>
  page.locator(`[data-testid="flow-canvas-node"][data-node-id="${id}"]`);

// ClickLocal #58: montar um flow só com o mouse — arrastar requests, ligar nós, ligar campos.
test("builds login → create → fetch with the mouse only, maps data between ports and runs it", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const backend = await startBackend();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Canvas Demo");
    const root = workspaceRoot(workspacesRoot);
    writeRequests(root, backend.base);

    await window.getByTitle("New…").click();
    await window.getByRole("menuitem", { name: "New flow" }).click();
    const panel = window.getByTestId("flow-panel");
    await expect(panel).toBeVisible();
    const canvas = panel.getByTestId("flow-canvas");

    // Expandir a pasta na árvore abre a aba dela: volta ao flow, e afasta o canvas para caber três nós.
    await openFlowTree(window);
    await window.getByTestId("flow-item").first().click();
    await expect(canvas).toBeVisible();
    for (let i = 0; i < 3; i++) await panel.getByRole("button", { name: "Zoom out" }).click();

    const box = (await canvas.boundingBox())!;
    const drops: [string, number][] = [
      ["Login", 90],
      ["Create user", 280],
      ["Get user", 470],
    ];
    for (const [name, dx] of drops) {
      const row = window.getByRole("treeitem").filter({ hasText: name });
      await dragBetween(window, await center(row), { x: box.x + dx, y: box.y + 120 });
    }
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(3);
    await expect(window.getByTestId("flow-dirty")).toBeVisible();

    // Arestas: da saída de um nó ao seguinte.
    const chain: [string, string][] = [
      ["login", "create-user"],
      ["create-user", "get-user"],
    ];
    for (const [from, to] of chain) {
      await dragBetween(
        window,
        await center(flowNode(window, from).getByTestId("flow-out-handle")),
        await center(flowNode(window, to)),
      );
    }
    await expect(panel.getByTestId("flow-edge")).toHaveCount(2);

    // Primeiro run: ainda sem mapeamentos, o login responde e deixa campos para ligar.
    await panel.getByTestId("flow-run").click();
    await expect(panel.getByTestId("flow-summary")).toBeVisible();
    await expect(flowNode(window, "login")).toHaveAttribute("data-state", "ok");

    // Portas: campo da resposta → `{{variável}}` da próxima request.
    await panel.getByTestId("flow-ports-toggle").check();
    await dragBetween(
      window,
      await center(
        flowNode(window, "login").getByTestId("flow-out-port").filter({ hasText: "data.token" }),
      ),
      await center(
        flowNode(window, "create-user").getByTestId("flow-in-port").filter({ hasText: "token" }),
      ),
    );
    await expect(panel.getByTestId("flow-mapping-line")).not.toHaveCount(0);

    // Com o token, o `create` agora responde 201 e expõe o `id`.
    await panel.getByTestId("flow-run").click();
    await expect(flowNode(window, "create-user")).toHaveAttribute("data-state", "ok");
    await dragBetween(
      window,
      await center(
        flowNode(window, "create-user").getByTestId("flow-out-port").filter({ hasText: /^id/ }),
      ),
      await center(
        flowNode(window, "get-user").getByTestId("flow-in-port").filter({ hasText: "user_id" }),
      ),
    );

    // Segunda dupla de mapeamentos feita: o flow inteiro passa, cada nó com o status 2xx.
    await panel.getByTestId("flow-run").click();
    await expect(panel.getByTestId("flow-summary")).toContainText("Flow passed");
    for (const id of ["login", "create-user", "get-user"]) {
      await expect(flowNode(window, id)).toHaveAttribute("data-state", "ok");
    }

    // Clicar num nó mostra o que aconteceu naquela execução.
    await flowNode(window, "get-user").click();
    const inspector = panel.getByTestId("flow-inspector");
    await expect(inspector.getByTestId("flow-node-result")).toContainText("GET");
    await expect(inspector.getByTestId("flow-response-body")).toContainText("Ada");

    await window.screenshot({ path: "test-results/flows-canvas-light.png" });
    await window.emulateMedia({ colorScheme: "dark" });
    await expect(window.locator("html")).toHaveClass(/dark/);
    await window.screenshot({ path: "test-results/flows-canvas-dark.png" });
    await window.emulateMedia({ colorScheme: "light" });

    // Salvar com o atalho de sempre: grava o rascunho e limpa a marca de "não salvo".
    await saveActiveTab(electronApp);
    await expect(window.getByTestId("flow-dirty")).toHaveCount(0);
    const saved = readFileSync(join(root, "flows", "new-flow.flow.yaml"), "utf-8");
    expect(saved).toMatch(/^wttp: 2\nname: New flow\n/);
    expect(saved).toContain("- { from: login, to: create-user }");
    expect(saved).toContain("- { from: create-user, to: get-user }");
    expect(saved).toContain("- { from: login.res.body.data.token, to: token }");
    expect(saved).toContain("- { from: create-user.res.body.id, to: user_id }");
    await expect(panel.getByTestId("flow-save")).toBeDisabled();
  } finally {
    await stopBackend(backend);
  }
});

// ClickLocal #57/#59: um flow v1 (linear) abre, roda e é migrado para o v2 ao salvar.
test("opens a v1 linear flow, runs it and upgrades the file to v2 on save", async ({
  window,
  workspacesRoot,
}) => {
  const backend = await startBackend();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Legacy Demo");
    const root = workspaceRoot(workspacesRoot);
    writeRequests(root, backend.base);
    mkdirSync(join(root, "flows"), { recursive: true });
    const v1 = `wttp: 1
name: Legacy flow
nodes:
  - { id: login, request: api/login.req.yaml, x: 0, y: 0 }
  - { id: create, request: api/create-user.req.yaml, x: 280, y: 0 }
  - { id: fetch, request: api/get-user.req.yaml, x: 560, y: 0 }
mappings:
  - { from: login.res.body.data.token, to: token }
  - { from: create.res.body.id, to: user_id }
`;
    writeFileSync(join(root, "flows", "legacy-flow.flow.yaml"), v1);

    await window.getByTestId("flow-item").filter({ hasText: "Legacy flow" }).click();
    const panel = window.getByTestId("flow-panel");
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(3);
    await expect(panel.getByTestId("flow-edge")).toHaveCount(2);

    await panel.getByTestId("flow-run").click();
    await expect(panel.getByTestId("flow-summary")).toContainText("Flow passed");

    // Mexe num nó (arrasta) e salva: o arquivo passa a ser o v2, com as arestas da ordem antiga.
    const fetchNode = flowNode(window, "fetch");
    await dragBetween(window, await center(fetchNode), {
      x: (await center(fetchNode)).x,
      y: (await center(fetchNode)).y + 100,
    });
    await panel.getByTestId("flow-save").click();
    await expect(window.getByTestId("flow-dirty")).toHaveCount(0);
    const saved = readFileSync(join(root, "flows", "legacy-flow.flow.yaml"), "utf-8");
    expect(saved).toMatch(/^wttp: 2\n/);
    expect(saved).toContain(
      "- { id: login, type: request, request: api/login.req.yaml, x: 0, y: 0 }",
    );
    expect(saved).toContain("- { from: login, to: create }");
    expect(saved).toContain("- { from: create, to: fetch }");
    expect(saved).toContain("- { from: create.res.body.id, to: user_id }");
  } finally {
    await stopBackend(backend);
  }
});

// ClickLocal #59: condição com dois ramos e poll until num job assíncrono, com o caminho destacado.
test("branches on a condition, polls a job until it is done and highlights the path taken", async ({
  window,
  workspacesRoot,
}) => {
  const backend = await startBackend();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Control Demo");
    const root = workspaceRoot(workspacesRoot);
    writeRequests(root, backend.base);
    mkdirSync(join(root, "flows"), { recursive: true });
    writeFileSync(
      join(root, "flows", "control.flow.yaml"),
      `wttp: 2
name: Control
nodes:
  - { id: login, type: request, request: api/login.req.yaml, x: 0, y: 0 }
  - { id: logged, type: condition, when: { source: status, op: eq, value: "200" }, x: 300, y: 0 }
  - { id: job, type: request, request: api/job.req.yaml, x: 600, y: -60 }
  - { id: wait, type: pollUntil, when: { source: body, path: job.state, op: eq, value: done }, intervalMs: 1000, maxAttempts: 5, x: 900, y: -60 }
  - { id: fallback, type: request, request: api/ok.req.yaml, x: 600, y: 120 }
edges:
  - { from: login, to: logged }
  - { from: logged, to: job, when: true }
  - { from: logged, to: fallback, when: false }
  - { from: job, to: wait }
maxSteps: 30
`,
    );

    await window.getByTestId("flow-item").filter({ hasText: "Control" }).click();
    const panel = window.getByTestId("flow-panel");
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(5);
    await expect(flowNode(window, "logged")).toHaveAttribute("data-node-type", "condition");

    await panel.getByTestId("flow-run").click();
    await expect(panel.getByTestId("flow-summary")).toContainText("Flow passed", {
      timeout: 15000,
    });

    // Ramo verdadeiro percorrido; o falso não rodou. O poll terminou na 3ª consulta.
    await expect(flowNode(window, "logged")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "job")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "wait")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "fallback")).toHaveAttribute("data-state", "skipped");
    await flowNode(window, "wait").click();
    await expect(panel.getByTestId("flow-node-result")).toContainText("3 attempts");

    await window.screenshot({ path: "test-results/flows-control-light.png" });
    await window.emulateMedia({ colorScheme: "dark" });
    await expect(window.locator("html")).toHaveClass(/dark/);
    await window.screenshot({ path: "test-results/flows-control-dark.png" });
    await window.emulateMedia({ colorScheme: "light" });

    // Edita a condição pelo formulário (o caminho por teclado): agora o ramo falso é o que roda.
    await flowNode(window, "logged").click();
    await panel.getByTestId("condition-value").locator("input").fill("201");
    await expect(window.getByTestId("flow-dirty")).toBeVisible();
    await panel.getByTestId("flow-run").click();
    await expect(flowNode(window, "fallback")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "job")).toHaveAttribute("data-state", "skipped");
  } finally {
    await stopBackend(backend);
  }
});

// ClickLocal #58: 50 nós continuam fluidos (pan e zoom sem travar) e navegáveis por teclado.
test("keeps a 50-node canvas smooth and navigable by keyboard", async ({
  window,
  workspacesRoot,
}) => {
  const backend = await startBackend();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Big Demo");
    const root = workspaceRoot(workspacesRoot);
    writeRequests(root, backend.base);
    mkdirSync(join(root, "flows"), { recursive: true });
    const nodes = Array.from(
      { length: 50 },
      (_, i) =>
        `  - { id: n${i}, type: request, request: api/ok.req.yaml, x: ${(i % 10) * 280}, y: ${Math.floor(i / 10) * 140} }`,
    ).join("\n");
    const edges = Array.from({ length: 49 }, (_, i) => `  - { from: n${i}, to: n${i + 1} }`).join(
      "\n",
    );
    writeFileSync(
      join(root, "flows", "big.flow.yaml"),
      `wttp: 2\nname: Big\nnodes:\n${nodes}\nedges:\n${edges}\n`,
    );

    await window.getByTestId("flow-item").filter({ hasText: "Big" }).click();
    const panel = window.getByTestId("flow-panel");
    const canvas = panel.getByTestId("flow-canvas");
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(50);
    await panel.getByTestId("flow-fit").click();

    // Mede o tempo entre quadros enquanto faz pan e zoom com o mouse.
    const box = (await canvas.boundingBox())!;
    await window.evaluate(() => {
      const frames: number[] = [];
      let last = performance.now();
      const state = { running: true };
      const tick = (now: number): void => {
        frames.push(now - last);
        last = now;
        if (state.running) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      (
        window as unknown as { __frames: { frames: number[]; state: { running: boolean } } }
      ).__frames = { frames, state };
    });
    await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 20; i++) await window.mouse.wheel(0, i % 2 === 0 ? -120 : 120);
    await window.mouse.down();
    await window.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 100, {
      steps: 40,
    });
    await window.mouse.up();
    const frames = await window.evaluate(() => {
      const holder = (
        window as unknown as { __frames: { frames: number[]; state: { running: boolean } } }
      ).__frames;
      holder.state.running = false;
      return holder.frames.slice(1);
    });
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    test.info().annotations.push({ type: "frame-p95-ms", description: p95.toFixed(1) });
    expect(p95).toBeLessThan(100);

    // Teclado: foco num nó seleciona, Shift+setas movem, Delete remove.
    const first = flowNode(window, "n0");
    await first.focus();
    await expect(panel.getByTestId("flow-inspector-request")).toBeVisible();
    await window.keyboard.press("Shift+ArrowRight");
    await window.keyboard.press("Shift+ArrowDown");
    await expect(window.getByTestId("flow-dirty")).toBeVisible();
    await window.keyboard.press("Delete");
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(49);
  } finally {
    await stopBackend(backend);
  }
});

// Regressão: logo depois de salvar, o canvas não pode piscar sem nós (a árvore ainda não tinha relido o arquivo).
test("keeps the nodes on screen while a new flow is being saved", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const backend = await startBackend();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Save Demo");
    writeRequests(workspaceRoot(workspacesRoot), backend.base);
    await window.getByTitle("New…").click();
    await window.getByRole("menuitem", { name: "New flow" }).click();
    const panel = window.getByTestId("flow-panel");
    await expect(window.getByRole("treeitem").filter({ hasText: "API" })).toBeVisible();

    // O seletor só lista a request depois que a árvore a vê.
    await expect(panel.getByTestId("flow-add-request").locator("option")).toContainText([
      "Pick a request…",
      "POST API / Login",
    ]);
    await panel
      .getByTestId("flow-add-request")
      .locator("select")
      .selectOption({ label: "POST API / Login" });
    await panel.getByTestId("flow-add-node").click();
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(1);

    // Observa o DOM durante o save: nenhuma leitura pode ter zero nós.
    await window.evaluate(() => {
      const counts: number[] = [];
      new MutationObserver(() => {
        counts.push(document.querySelectorAll('[data-testid="flow-canvas-node"]').length);
      }).observe(document.body, { childList: true, subtree: true });
      (window as unknown as { __counts: number[] }).__counts = counts;
    });
    await saveActiveTab(electronApp);
    await expect(window.getByTestId("flow-dirty")).toHaveCount(0);
    await window.waitForTimeout(300);
    const counts = await window.evaluate(
      () => (window as unknown as { __counts: number[] }).__counts,
    );
    expect(counts).not.toContain(0);
    await expect(panel.getByTestId("flow-canvas-node")).toHaveCount(1);
  } finally {
    await stopBackend(backend);
  }
});

// Nó de função: N saídas e JavaScript, como no Node-RED — o código escolhe por onde o flow segue.
test("builds a function node with two outputs, routes by its code and keeps it in the file", async ({
  electronApp,
  window,
  workspacesRoot,
}) => {
  const backend = await startBackend();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Function Demo");
    const root = workspaceRoot(workspacesRoot);
    writeRequests(root, backend.base);

    await window.getByTitle("New…").click();
    await window.getByRole("menuitem", { name: "New flow" }).click();
    const panel = window.getByTestId("flow-panel");
    await expect(window.getByRole("treeitem").filter({ hasText: "API" })).toBeVisible();

    const add = async (label: string): Promise<void> => {
      await panel.getByTestId("flow-add-request").locator("select").selectOption({ label });
      await panel.getByTestId("flow-add-node").click();
    };
    await expect(panel.getByTestId("flow-add-request").locator("option")).toContainText([
      "Pick a request…",
      "POST API / Login",
    ]);
    await add("POST API / Login");
    await panel.getByTestId("flow-add-function").click();
    await expect(flowNode(window, "function")).toHaveAttribute("data-node-type", "function");

    // O nó de função novo já vem com 2 saídas e um código de partida; o "Add" liga na primeira livre.
    await expect(flowNode(window, "function").getByTestId("flow-out-handle")).toHaveCount(2);
    await add("GET API / Ok");
    await expect(panel.getByTestId("flow-edge")).toHaveCount(2);

    // O "Add" encadeia no fim (ok → get-user). Apaga essa aresta pelo teclado e liga a saída 2 da
    // função ao "Get user" arrastando.
    await add("GET API / Get user");
    await panel.getByTestId("flow-fit").click();
    await expect(panel.getByTestId("flow-edge")).toHaveCount(3);
    await panel.getByTestId("flow-edge").nth(2).locator("path").last().dispatchEvent("click");
    await window.keyboard.press("Delete");
    await expect(panel.getByTestId("flow-edge")).toHaveCount(2);
    await dragBetween(
      window,
      await center(
        flowNode(window, "function").locator('[data-testid="flow-out-handle"][data-output="2"]'),
      ),
      await center(flowNode(window, "get-user")),
    );
    await expect(panel.getByTestId("flow-edge")).toHaveCount(3);

    const inspector = panel.getByTestId("flow-inspector");
    await flowNode(window, "function").click();
    // O painel se redimensiona pela borda esquerda (mouse e teclado) e lembra a largura.
    const handle = inspector.getByTestId("flow-inspector-resize");
    const before = (await inspector.boundingBox())!.width;
    const grip = await center(handle);
    await dragBetween(window, grip, { x: grip.x - 180, y: grip.y });
    const wider = (await inspector.boundingBox())!.width;
    expect(wider).toBeGreaterThan(before + 150);
    await handle.focus();
    await window.keyboard.press("ArrowRight");
    expect((await inspector.boundingBox())!.width).toBeLessThan(wider);
    await handle.dblclick();
    expect(Math.round((await inspector.boundingBox())!.width)).toBe(320);
    await dragBetween(window, await center(handle), {
      x: (await center(handle)).x - 120,
      y: (await center(handle)).y,
    });

    await expect(inspector.getByTestId("function-outputs").locator("input")).toHaveValue("2");

    // Código: saída 1 se o login deu 200, senão a 2. Também escreve uma variável e loga.
    await fillCodeMirror(
      window,
      inspector.getByTestId("function-code"),
      "console.log('status', res.status);\nvars.logged = String(res.status);\nreturn res.status === 200 ? 1 : 2;",
    );
    await panel.getByTestId("flow-run").click();
    await expect(panel.getByTestId("flow-summary")).toContainText("Flow passed");
    await expect(flowNode(window, "function")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "ok")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "get-user")).toHaveAttribute("data-state", "skipped");
    await flowNode(window, "function").click();
    await expect(inspector.getByTestId("flow-node-result")).toContainText("Output 1");
    await expect(inspector.getByTestId("flow-console")).toContainText("status 200");

    await window.screenshot({ path: "test-results/flows-function-light.png" });
    await window.emulateMedia({ colorScheme: "dark" });
    await expect(window.locator("html")).toHaveClass(/dark/);
    await window.screenshot({ path: "test-results/flows-function-dark.png" });
    await window.emulateMedia({ colorScheme: "light" });

    // Troca o código: agora o caminho é o da saída 2.
    await fillCodeMirror(window, inspector.getByTestId("function-code"), "return 2;");
    await panel.getByTestId("flow-run").click();
    await expect(flowNode(window, "get-user")).toHaveAttribute("data-state", "ok");
    await expect(flowNode(window, "ok")).toHaveAttribute("data-state", "skipped");

    // Uma saída inexistente falha o nó com a explicação, e o flow para ali.
    await fillCodeMirror(window, inspector.getByTestId("function-code"), "return 7;");
    await panel.getByTestId("flow-run").click();
    await expect(flowNode(window, "function")).toHaveAttribute("data-state", "failed");
    await flowNode(window, "function").click();
    await expect(inspector.getByTestId("flow-node-result")).toContainText(
      "chose output 7, but this node has 2 outputs",
    );

    // O arquivo guarda o tipo, as saídas, o código em bloco literal e as arestas numeradas.
    await fillCodeMirror(window, inspector.getByTestId("function-code"), "return 1;\n");
    await saveActiveTab(electronApp);
    await expect(window.getByTestId("flow-dirty")).toHaveCount(0);
    const saved = readFileSync(join(root, "flows", "new-flow.flow.yaml"), "utf-8");
    expect(saved).toMatch(/- id: function\n {4}type: function\n {4}outputs: 2\n {4}code: /);
    expect(saved).toContain("- { from: login, to: function }");
    expect(saved).toContain("- { from: function, to: ok, output: 1 }");
    expect(saved).toContain("- { from: function, to: get-user, output: 2 }");

    // A entrada fica sempre no meio da altura do nó, mesmo quando as saídas o alongam.
    await flowNode(window, "function").click();
    await inspector.getByTestId("function-outputs").locator("input").fill("4");
    await expect(flowNode(window, "function").getByTestId("flow-out-handle")).toHaveCount(4);
    const card = (await flowNode(window, "function").boundingBox())!;
    const entry = await center(flowNode(window, "function").getByTestId("flow-in-handle"));
    expect(Math.abs(entry.y - (card.y + card.height / 2))).toBeLessThan(3);
    await window.screenshot({ path: "test-results/flows-function-four-outputs.png" });

    // Reduzir as saídas leva junto a aresta que perdeu a saída.
    await flowNode(window, "function").click();
    await inspector.getByTestId("function-outputs").locator("input").fill("1");
    await expect(panel.getByTestId("flow-edge")).toHaveCount(2);
    await expect(flowNode(window, "function").getByTestId("flow-out-handle")).toHaveCount(1);
  } finally {
    await stopBackend(backend);
  }
});
