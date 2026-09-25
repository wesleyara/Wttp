import { createServer, type Server } from "node:http";

import { expect, test } from "./fixtures";
import {
  createCollection,
  createRequest,
  createWorkspace,
  fillCodeMirror,
  openRequestTab,
  requestUrlEditor,
  seedWorkspacesRoot,
} from "./helpers";

/** Servidor que muda de estado: `processing` nas duas primeiras chamadas, `done` a partir da terceira; `/slow` demora. */
function startJobServer(): Promise<{
  url: string;
  hits: () => number;
  close: () => Promise<void>;
}> {
  let count = 0;
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith("/slow")) return void setTimeout(() => res.end("{}"), 60_000).unref();
    count += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ job: { status: count >= 3 ? "done" : "processing" }, hit: count }));
  });
  return new Promise(resolve =>
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        hits: () => count,
        close: () => {
          server.closeAllConnections();
          return new Promise(done => server.close(() => done()));
        },
      });
    }),
  );
}

// Card #50 (ClickLocal): "poll until" para no primeiro match, a sessão deixa exatamente
// uma entrada no histórico e o Stop interrompe de verdade.
test("watches until a JSON field matches and records one history entry", async ({
  window,
  workspacesRoot,
}) => {
  const server = await startJobServer();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Watch Workspace");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");
    await fillCodeMirror(window, requestUrlEditor(window), `${server.url}/job`);

    await window.getByTestId("watch-options").click();
    await window.getByTestId("send-mode-watch").click();
    await window.getByTestId("watch-interval").locator("input").fill("1");
    await window.getByTestId("watch-until").selectOption("json");
    await window.getByTestId("watch-json-path").locator("input").fill("$.job.status");
    await window.getByTestId("watch-json-value").locator("input").fill("done");
    await window.getByTestId("watch-max-attempts").locator("input").fill("10");
    await window.getByTestId("watch-confirm").click();

    await expect(window.getByTestId("status-watching")).toBeVisible();
    await expect(
      window.getByText("Watch finished: condition met after 3 iteration(s)"),
    ).toBeVisible({
      timeout: 15_000,
    });
    expect(server.hits()).toBe(3);
    await expect(window.getByTestId("status-watching")).toHaveCount(0);

    // A aba Watch mostra o diff da última iteração para a anterior.
    await window.getByRole("tab", { name: /^Watch/ }).click();
    await expect(window.getByTestId("watch-panel")).toContainText("condition met");
    await expect(window.getByTestId("watch-panel")).toContainText("processing");

    // Exatamente uma entrada de histórico para a sessão inteira.
    await window.getByRole("tab", { name: /^History/ }).click();
    await expect(window.getByRole("tab", { name: /^History/ })).toContainText("1");
  } finally {
    await server.close();
  }
});

test("respects the attempt limit and Stop cancels the request in flight", async ({
  window,
  workspacesRoot,
}) => {
  const server = await startJobServer();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Watch Limit");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");
    await fillCodeMirror(window, requestUrlEditor(window), `${server.url}/job`);

    await window.getByTestId("watch-options").click();
    await window.getByTestId("send-mode-watch").click();
    await window.getByTestId("watch-interval").locator("input").fill("1");
    await window.getByTestId("watch-until").selectOption("status");
    await window.getByTestId("watch-status").locator("input").fill("404");
    await window.getByTestId("watch-max-attempts").locator("input").fill("2");
    await window.getByTestId("watch-confirm").click();
    await expect(window.getByText("Watch stopped: no match after 2 attempts")).toBeVisible({
      timeout: 15_000,
    });

    // Stop com uma request pendurada: o servidor nunca responde a `/slow`.
    await fillCodeMirror(window, requestUrlEditor(window), `${server.url}/slow`);
    await window.getByTestId("send-main").click();
    await expect(window.getByTestId("watch-stop")).toBeVisible();
    await window.getByTestId("watch-stop").click();
    await expect(window.getByTestId("send-main")).toBeVisible({ timeout: 5000 });
    await expect(window.getByTestId("status-watching")).toHaveCount(0);
  } finally {
    await server.close();
  }
});

test("warns before repeating a pre-request script", async ({ window, workspacesRoot }) => {
  const server = await startJobServer();
  try {
    await seedWorkspacesRoot(window, workspacesRoot);
    await createWorkspace(window, "Watch Pre");
    await createCollection(window);
    await createRequest(window);
    await openRequestTab(window, "New request");
    await fillCodeMirror(window, requestUrlEditor(window), `${server.url}/job`);
    await window.getByRole("tab", { name: "Scripts" }).click();
    await window.getByRole("tab", { name: "Pre-request" }).click();
    await fillCodeMirror(
      window,
      window.getByTestId("script-prerequest-editor"),
      'console.log("hi");',
    );

    await window.getByTestId("watch-options").click();
    await window.getByTestId("send-mode-watch").click();
    await window.keyboard.press("Escape");
    await window.getByTestId("send-main").click();
    await expect(window.getByText("Pre-request scripts will repeat")).toBeVisible();
    expect(server.hits()).toBe(0);
    await window.getByTestId("watch-preRequest-confirm").click();
    await expect(window.getByTestId("watch-stop")).toBeVisible();
    await window.getByTestId("watch-stop").click();
  } finally {
    await server.close();
  }
});
