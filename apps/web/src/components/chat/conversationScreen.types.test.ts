import { describe, expect, it } from "vite-plus/test";

import {
  projectConversationCapabilities,
  threadComposerCapabilities,
} from "../composer/composerCapabilities";
import {
  buildConversationSurfaceCapabilities,
  deriveConversationExecutionCapabilities,
} from "./conversationScreen.types";

describe("conversation screen contract", () => {
  it("describes the full standard code-thread surface without provider-specific types", () => {
    const execution = deriveConversationExecutionCapabilities({
      available: true,
      supportedControls: ["turn", "input", "approval", "interrupt", "stop"],
      supportsSteer: true,
      supportsQueue: true,
    });

    expect(
      buildConversationSurfaceCapabilities({
        composer: threadComposerCapabilities(),
        execution,
        timeline: {
          diffs: true,
          checkpoints: true,
          imageExpansion: true,
          reasoningSummaries: true,
          childNavigation: true,
        },
        panels: {
          context: true,
          files: true,
          diff: true,
          terminal: true,
          browser: true,
        },
      }),
    ).toMatchObject({
      execution: {
        send: true,
        queue: true,
        steer: true,
        interrupt: true,
        approvals: true,
        userInput: true,
      },
      timeline: {
        diffs: true,
        checkpoints: true,
        imageExpansion: true,
        reasoningSummaries: true,
        childNavigation: true,
      },
      panels: {
        context: true,
        files: true,
        diff: true,
        terminal: true,
        browser: true,
      },
    });
  });

  it("describes a planning-only Jarvis conversation through capabilities", () => {
    const composer = projectConversationCapabilities({
      catalog: null,
      engine: "jarvis",
      hasWorkspace: false,
      hasProjectFiles: true,
    });
    const execution = deriveConversationExecutionCapabilities({
      available: true,
      supportedControls: ["turn"],
      supportsSteer: false,
      supportsQueue: false,
    });

    expect(
      buildConversationSurfaceCapabilities({
        composer,
        execution,
        timeline: { imageExpansion: true, reasoningSummaries: true },
        panels: { context: true },
      }),
    ).toEqual({
      composer,
      execution: {
        send: true,
        queue: false,
        steer: false,
        interrupt: false,
        approvals: false,
        userInput: false,
      },
      timeline: {
        diffs: false,
        checkpoints: false,
        imageExpansion: true,
        reasoningSummaries: true,
        childNavigation: false,
      },
      panels: {
        context: true,
        files: false,
        diff: false,
        terminal: false,
        browser: false,
      },
    });
  });

  it("never advertises execution controls for an unavailable runtime", () => {
    expect(
      deriveConversationExecutionCapabilities({
        available: false,
        supportedControls: ["turn", "input", "approval", "interrupt", "stop"],
        supportsSteer: true,
        supportsQueue: true,
      }),
    ).toEqual({
      send: false,
      queue: false,
      steer: false,
      interrupt: false,
      approvals: false,
      userInput: false,
    });
  });
});
