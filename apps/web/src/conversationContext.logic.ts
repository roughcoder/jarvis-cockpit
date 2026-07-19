import type { ConversationContextContribution } from "@t3tools/client-runtime/conversation";

import type { Project, Thread } from "./types";

export function standardConversationContextContributions(input: {
  readonly project: Project | null;
  readonly thread: Thread;
}): ConversationContextContribution[] {
  const repository = input.project?.repositoryIdentity;
  const repositoryLabel = repository?.displayName ?? repository?.canonicalKey ?? null;
  const workspaceRoot = input.project?.workspaceRoot ?? null;
  const workspaceSummary = input.thread.worktreePath ?? workspaceRoot;

  return [
    {
      id: "project",
      kind: "project",
      title: "Project",
      summary: input.project?.title ?? "Project unavailable",
      items: [
        ...(repositoryLabel
          ? [
              {
                id: "project:repository",
                label: "Repository",
                value: repositoryLabel,
              },
            ]
          : []),
        ...(workspaceRoot
          ? [
              {
                id: "project:workspace-root",
                label: "Workspace root",
                value: workspaceRoot,
              },
            ]
          : []),
      ],
      emptyMessage: "No project context available.",
    },
    {
      id: "workspace",
      kind: "workspace",
      title: "Workspace",
      ...(workspaceSummary ? { summary: workspaceSummary } : {}),
      items: input.thread.branch
        ? [
            {
              id: "workspace:branch",
              label: "Branch",
              value: input.thread.branch,
            },
          ]
        : [],
      emptyMessage: "No branch or worktree attached.",
    },
  ];
}
