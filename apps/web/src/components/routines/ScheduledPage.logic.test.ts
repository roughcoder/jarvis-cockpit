import { describe, expect, it } from "vite-plus/test";

import { scheduleRoutinePresentation } from "./ScheduledPage.logic";

describe("scheduled page presentation", () => {
  it("keeps a schedule visible when its routine catalog entry is unavailable", () => {
    expect(scheduleRoutinePresentation({ routineId: "retired-routine" }, null)).toEqual({
      icon: "brief",
      name: "retired-routine",
    });
  });
});
