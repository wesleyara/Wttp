import { describe, expect, it } from "vitest";

import { resolveShell, shellName } from "./sessions";

describe("resolveShell", () => {
  it("uses $SHELL on Linux, falling back to bash", () => {
    expect(resolveShell("linux", { SHELL: "/usr/bin/fish" })).toEqual({
      file: "/usr/bin/fish",
      args: [],
    });
    expect(resolveShell("linux", {})).toEqual({ file: "/bin/bash", args: [] });
  });

  it("starts a login shell on macOS", () => {
    expect(resolveShell("darwin", { SHELL: "/bin/zsh" })).toEqual({
      file: "/bin/zsh",
      args: ["-l"],
    });
  });

  it("uses COMSPEC on Windows, falling back to PowerShell", () => {
    expect(resolveShell("win32", { COMSPEC: "C:\\Windows\\cmd.exe" }).file).toBe(
      "C:\\Windows\\cmd.exe",
    );
    expect(resolveShell("win32", {}).file).toBe("powershell.exe");
  });

  it("a configured shell wins everywhere", () => {
    expect(resolveShell("linux", { SHELL: "/bin/bash" }, "  /usr/bin/zsh ").file).toBe(
      "/usr/bin/zsh",
    );
  });
});

describe("shellName", () => {
  it("names the tab after the shell binary", () => {
    expect(shellName("/usr/bin/zsh")).toBe("zsh");
    expect(shellName("bash")).toBe("bash");
    expect(shellName("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(shellName("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("pwsh");
  });
});
