import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";

vi.mock("../config-file.js", () => ({
  readConfigFile: () => null,
}));

import { listCodexModels, refreshCodexModels } from "./codex-models.js";

function writeCache(dir: string, payload: unknown): void {
  fs.writeFileSync(
    path.join(dir, "models_cache.json"),
    typeof payload === "string" ? payload : JSON.stringify(payload),
  );
}

function cacheEntry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: "gpt-test",
    display_name: "GPT Test",
    visibility: "list",
    ...overrides,
  };
}

describe("codex model discovery via the CLI models cache", () => {
  let tempHome: string;
  const originalCodexHome = process.env.CODEX_HOME;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-codex-models-"));
    process.env.CODEX_HOME = tempHome;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("returns the static fallback when the cache file is missing", async () => {
    const models = await listCodexModels();
    expect(models.map((m) => m.id)).toEqual(
      [...codexFallbackModels.map((m) => m.id)].sort((a, b) =>
        a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
      ),
    );
  });

  it("lists cache entries with visibility list and keeps internal slugs out", async () => {
    writeCache(tempHome, {
      models: [
        cacheEntry({ slug: "gpt-5.5", display_name: "GPT-5.5" }),
        cacheEntry({ slug: "gpt-reserve", display_name: "GPT Reserve", visibility: "hide" }),
        cacheEntry({ slug: "codex-auto-review", visibility: null }),
      ],
    });

    const models = await listCodexModels();
    const ids = models.map((m) => m.id);

    expect(ids).toContain("gpt-5.5");
    expect(ids).not.toContain("gpt-reserve");
    expect(ids).not.toContain("codex-auto-review");
    // Static fallback ids still merge in.
    for (const fallback of codexFallbackModels) {
      expect(ids).toContain(fallback.id);
    }
    expect(models.find((m) => m.id === "gpt-5.5")?.label).toBe("GPT-5.5");
  });

  it("falls back to the slug when a cache entry has no display name", async () => {
    writeCache(tempHome, {
      models: [cacheEntry({ slug: "o3-mini", display_name: "" })],
    });

    const models = await listCodexModels();
    expect(models.find((m) => m.id === "o3-mini")?.label).toBe("o3-mini");
  });

  it("returns the static fallback when the cache file is malformed", async () => {
    writeCache(tempHome, "{not json");

    const models = await refreshCodexModels();
    expect(models.map((m) => m.id)).toEqual(
      [...codexFallbackModels.map((m) => m.id)].sort((a, b) =>
        a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }),
      ),
    );
  });

  it("returns the static fallback when the cache payload has no models array", async () => {
    writeCache(tempHome, { fetched_at: "2026-09-09T00:00:00Z" });

    const models = await listCodexModels();
    expect(models.length).toBe(codexFallbackModels.length);
  });

  it("ignores cache entries whose slug is missing or empty", async () => {
    writeCache(tempHome, {
      models: [
        cacheEntry({ slug: "", display_name: "Empty" }),
        { display_name: "No slug", visibility: "list" },
        cacheEntry({ slug: "gpt-5" }),
      ],
    });

    const models = await listCodexModels();
    const ids = models.map((m) => m.id);
    expect(ids).toContain("gpt-5");
    expect(ids).not.toContain("");
  });
});
