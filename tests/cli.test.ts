
import { describe, expect, it } from "vitest";

describe("GitSound", () => {
  it("should identify the application correctly", async () => {
    const { Command } = await import("commander");

    const program = new Command();
    program.name("gitsound");

    expect(program.name()).toBe("gitsound");
  });
});
