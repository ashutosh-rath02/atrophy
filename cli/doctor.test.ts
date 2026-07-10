import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBank, checkDb, checkEditor, checkGrading, checkNode } from "./doctor.js";

describe("checkNode", () => {
  it("passes on supported versions", () => {
    expect(checkNode("v22.18.0").status).toBe("pass");
    expect(checkNode("v24.0.0").status).toBe("pass");
  });
  it("fails below the minimum", () => {
    expect(checkNode("v18.20.0").status).toBe("fail");
  });
  it("warns on an unparseable version", () => {
    expect(checkNode("weird").status).toBe("warn");
  });
});

describe("checkEditor", () => {
  it("passes when an editor env var is set", () => {
    expect(checkEditor({ EDITOR: "vim" }, false).status).toBe("pass");
    expect(checkEditor({ ATROPHY_EDITOR: "code" }, false).detail).toContain("code");
  });
  it("prefers ATROPHY_EDITOR over the standard vars", () => {
    expect(checkEditor({ ATROPHY_EDITOR: "code", EDITOR: "vim" }, false).detail).toBe("code");
  });
  it("passes when VS Code is detected", () => {
    expect(checkEditor({}, true).status).toBe("pass");
  });
  it("warns when nothing is available", () => {
    expect(checkEditor({}, false).status).toBe("warn");
  });
});

describe("checkBank", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "atrophy-doc-bank-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when the directory is null", () => {
    expect(checkBank(null).status).toBe("fail");
  });
  it("fails when the directory is empty", () => {
    expect(checkBank(dir).status).toBe("fail");
  });
  it("passes when the bank has exercises", () => {
    writeFileSync(
      join(dir, "sr-py-001.json"),
      JSON.stringify({
        kind: "write",
        id: "sr-py-001",
        axis: "syntax-recall",
        tier: 1,
        title: "t",
        prompt: "p",
        softTimeLimitSeconds: 60,
        language: "python",
        functionName: "f",
        starterCode: "def f():\n    pass\n",
        tests: [{ args: [], expected: null }],
      }),
    );
    const r = checkBank(dir);
    expect(r.status).toBe("pass");
    expect(r.detail).toContain("1 exercises");
  });
});

describe("checkDb", () => {
  it("opens a fresh database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "atrophy-doc-db-"));
    try {
      expect(checkDb(join(dir, "t.db")).status).toBe("pass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("checkGrading", () => {
  it("passes the sandbox smoke test", async () => {
    expect((await checkGrading()).status).toBe("pass");
  });
});
