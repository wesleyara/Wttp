import { describe, expect, it } from "vitest";

import { buildTerminalLaunch, splitCommandLine, TerminalUnavailableError } from "./terminal";

const has =
  (...installed: string[]) =>
  async (command: string) =>
    installed.includes(command);

describe("splitCommandLine", () => {
  it("splits on whitespace and keeps quoted segments together", () => {
    expect(splitCommandLine(`kitty --title "my term" -e 'a b'`)).toEqual([
      "kitty",
      "--title",
      "my term",
      "-e",
      "a b",
    ]);
  });

  it("never interprets shell operators", () => {
    expect(splitCommandLine("xterm; rm -rf /")).toEqual(["xterm;", "rm", "-rf", "/"]);
  });
});

describe("buildTerminalLaunch", () => {
  const base = { cwd: "/ws/My Space", exists: has() };

  it("uses Terminal.app on macOS", async () => {
    const launch = await buildTerminalLaunch({ ...base, platform: "darwin" });
    expect(launch).toEqual({ command: "open", args: ["-a", "Terminal", "/ws/My Space"] });
  });

  it("uses cmd on Windows", async () => {
    const launch = await buildTerminalLaunch({ ...base, platform: "win32" });
    expect(launch.command).toBe("cmd.exe");
  });

  it("picks the first installed Linux terminal with its cwd flag", async () => {
    const launch = await buildTerminalLaunch({
      ...base,
      platform: "linux",
      exists: has("konsole", "xterm"),
    });
    expect(launch).toEqual({ command: "konsole", args: ["--workdir", "/ws/My Space"] });
  });

  it("prefers $TERMINAL on Linux when installed", async () => {
    const launch = await buildTerminalLaunch({
      ...base,
      platform: "linux",
      env: { TERMINAL: "foot" },
      exists: has("foot", "xterm"),
    });
    expect(launch.command).toBe("foot");
  });

  it("fails clearly when no Linux terminal exists", async () => {
    await expect(buildTerminalLaunch({ ...base, platform: "linux" })).rejects.toBeInstanceOf(
      TerminalUnavailableError,
    );
  });

  it("a custom command wins on every platform and expands {cwd}", async () => {
    for (const platform of ["linux", "darwin", "win32"] as const) {
      const launch = await buildTerminalLaunch({
        ...base,
        platform,
        custom: "alacritty --working-directory {cwd}",
      });
      expect(launch).toEqual({
        command: "alacritty",
        args: ["--working-directory", "/ws/My Space"],
      });
    }
  });

  it("treats a blank custom command as unset", async () => {
    const launch = await buildTerminalLaunch({ ...base, platform: "darwin", custom: "   " });
    expect(launch.command).toBe("open");
  });
});
