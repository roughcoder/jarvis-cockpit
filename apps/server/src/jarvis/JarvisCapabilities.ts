import type {
  JarvisRouteCapability,
  JarvisRouteCapabilityGroup,
  JarvisRouteCapabilityStatus,
} from "@t3tools/contracts";

export interface JarvisCapabilityRouteDefinition {
  readonly id: string;
  readonly group: JarvisRouteCapabilityGroup;
  readonly label: string;
  readonly method: string;
  readonly path: string;
  readonly safeToProbe: boolean;
  readonly requires?: "project" | "thread";
}

export const JARVIS_CAPABILITY_ROUTE_DEFINITIONS: ReadonlyArray<JarvisCapabilityRouteDefinition> = [
  {
    id: "projects.list",
    group: "project",
    label: "List projects",
    method: "GET",
    path: "/v1/projects",
    safeToProbe: true,
  },
  {
    id: "projects.detail",
    group: "project",
    label: "Project detail",
    method: "GET",
    path: "/v1/projects/{id}",
    safeToProbe: true,
    requires: "project",
  },
  {
    id: "projects.create",
    group: "project",
    label: "Create project",
    method: "POST",
    path: "/v1/projects",
    safeToProbe: false,
  },
  {
    id: "projects.update",
    group: "project",
    label: "Update project",
    method: "PATCH",
    path: "/v1/projects/{id}",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.archive",
    group: "project",
    label: "Archive project",
    method: "POST",
    path: "/v1/projects/{id}/archive",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.memory",
    group: "memory",
    label: "Project memory",
    method: "GET",
    path: "/v1/projects/{id}/memory",
    safeToProbe: true,
    requires: "project",
  },
  {
    id: "projects.findings.create",
    group: "memory",
    label: "Record finding",
    method: "POST",
    path: "/v1/projects/{id}/findings",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.decisions.create",
    group: "memory",
    label: "Record decision",
    method: "POST",
    path: "/v1/projects/{id}/decisions",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.memory.forget",
    group: "memory",
    label: "Forget memory",
    method: "POST",
    path: "/v1/projects/{id}/memory/forget",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.memory.correct",
    group: "memory",
    label: "Correct memory",
    method: "POST",
    path: "/v1/projects/{id}/memory/correct",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.threads.list",
    group: "conversation",
    label: "List project conversations",
    method: "GET",
    path: "/v1/projects/{id}/threads",
    safeToProbe: true,
    requires: "project",
  },
  {
    id: "projects.threads.detail",
    group: "conversation",
    label: "Project conversation detail",
    method: "GET",
    path: "/v1/projects/{id}/threads/{tid}",
    safeToProbe: true,
    requires: "thread",
  },
  {
    id: "projects.threads.create",
    group: "conversation",
    label: "Create project conversation",
    method: "POST",
    path: "/v1/projects/{id}/threads",
    safeToProbe: false,
    requires: "project",
  },
  {
    id: "projects.threads.turn",
    group: "conversation",
    label: "Send project conversation turn",
    method: "POST",
    path: "/v1/projects/{id}/threads/{tid}/turns",
    safeToProbe: false,
    requires: "thread",
  },
  {
    id: "projects.threads.archive",
    group: "conversation",
    label: "Archive project conversation",
    method: "POST",
    path: "/v1/projects/{id}/threads/{tid}/archive",
    safeToProbe: false,
    requires: "thread",
  },
  {
    id: "projects.threads.unarchive",
    group: "conversation",
    label: "Unarchive project conversation",
    method: "POST",
    path: "/v1/projects/{id}/threads/{tid}/unarchive",
    safeToProbe: false,
    requires: "thread",
  },
  {
    id: "work.validate",
    group: "worker-dispatch",
    label: "Validate work dispatch",
    method: "POST",
    path: "/v1/work/validate",
    safeToProbe: false,
  },
  {
    id: "work.start",
    group: "worker-dispatch",
    label: "Start work dispatch",
    method: "POST",
    path: "/v1/work/start",
    safeToProbe: false,
  },
  {
    id: "routines.list",
    group: "routine",
    label: "List routines",
    method: "GET",
    path: "/v1/routines",
    safeToProbe: true,
  },
  {
    id: "routines.run",
    group: "routine",
    label: "Run routine",
    method: "POST",
    path: "/v1/routines/{routine_id}/run",
    safeToProbe: false,
  },
  {
    id: "schedules.list",
    group: "schedule",
    label: "List routine schedules",
    method: "GET",
    path: "/v1/schedules",
    safeToProbe: true,
  },
  {
    id: "schedules.create",
    group: "schedule",
    label: "Create routine schedule",
    method: "POST",
    path: "/v1/schedules",
    safeToProbe: false,
  },
  {
    id: "mcp.status",
    group: "mcp",
    label: "Jarvis mcp-serve status",
    method: "GET",
    path: "/v1/mcp/status",
    safeToProbe: true,
  },
  {
    id: "activity.list",
    group: "activity",
    label: "Project activity",
    method: "GET",
    path: "/v1/projects/{id}/activity",
    safeToProbe: true,
    requires: "project",
  },
] as const;

export function classifyJarvisCapabilityProbe(statusCode: number): {
  readonly status: JarvisRouteCapabilityStatus;
  readonly detail: string;
} {
  if (statusCode >= 200 && statusCode < 300) {
    return { status: "available", detail: "Safe read returned successfully." };
  }
  if (statusCode === 404) {
    return { status: "missing", detail: "Jarvis returned HTTP 404 for this route." };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { status: "auth-error", detail: `Jarvis returned HTTP ${statusCode}.` };
  }
  return {
    status: "not-probed",
    detail: `Safe read returned HTTP ${statusCode}; capability was not inferred.`,
  };
}

export function makeUnprobedJarvisCapability(
  route: JarvisCapabilityRouteDefinition,
  detail: string,
): JarvisRouteCapability {
  return {
    id: route.id,
    group: route.group,
    label: route.label,
    method: route.method,
    path: route.path,
    safe_to_probe: route.safeToProbe,
    status: "not-probed",
    status_code: null,
    detail,
    probed_at: null,
  };
}

export function makeProbedJarvisCapability(input: {
  readonly route: JarvisCapabilityRouteDefinition;
  readonly path: string;
  readonly statusCode: number;
  readonly probedAt: string;
}): JarvisRouteCapability {
  const classified = classifyJarvisCapabilityProbe(input.statusCode);
  return {
    id: input.route.id,
    group: input.route.group,
    label: input.route.label,
    method: input.route.method,
    path: input.path,
    safe_to_probe: input.route.safeToProbe,
    status: classified.status,
    status_code: input.statusCode,
    detail: classified.detail,
    probed_at: input.probedAt,
  };
}
