import prompts from "prompts";
import { describe, expect, it } from "vitest";
import { getCliExitCode, PromptAbortedError, promptOrAbort } from "../../src/cli.js";

describe("cli prompt cancellation", () => {
  it("throws PromptAbortedError when the user cancels a prompt", async () => {
    prompts.inject([new Error("cancelled")]);

    await expect(
      promptOrAbort({
        type: "text",
        name: "value",
        message: "Value"
      })
    ).rejects.toBeInstanceOf(PromptAbortedError);
  });

  it("maps prompt cancellation to the standard SIGINT exit code", () => {
    expect(getCliExitCode(new PromptAbortedError())).toBe(130);
    expect(getCliExitCode(new Error("boom"))).toBe(1);
  });
});
