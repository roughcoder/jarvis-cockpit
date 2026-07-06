import { describe, expect, it } from "vite-plus/test";

import {
  formatProjectConversationFailure,
  formatProjectWriteFailure,
} from "./JarvisProjects.logic";

describe("formatProjectWriteFailure", () => {
  it("keeps missing-authority detail for forbidden project writes", () => {
    expect(
      formatProjectWriteFailure(
        new Error(
          "Jarvis request projects.create failed with HTTP 403: missing authority: project.create",
        ),
      ),
    ).toBe("Jarvis denied the project write: missing authority: project.create");
  });

  it("treats HTTP 405 as a missing project-management route", () => {
    expect(
      formatProjectWriteFailure(new Error("Jarvis request projects.update failed with HTTP 405.")),
    ).toMatch(/does not expose project-management writes/);
  });

  it("does not blame missing APIs for generic request failures", () => {
    expect(formatProjectWriteFailure("failed")).toBe(
      "Cockpit could not complete the project write against this Jarvis brain. Check the brain connection, auth mode, and project permissions.",
    );
  });

  it("identifies missing conversation archive routes", () => {
    expect(
      formatProjectConversationFailure(
        new Error("Jarvis request projects.threads.archive failed with HTTP 404."),
      ),
    ).toMatch(/does not expose project conversation archive/);
  });

  it("identifies missing conversation archive routes from server result messages", () => {
    expect(
      formatProjectConversationFailure(
        "Jarvis request projects.threads.archive failed with HTTP 404.",
      ),
    ).toMatch(/does not expose project conversation archive/);
  });
});
