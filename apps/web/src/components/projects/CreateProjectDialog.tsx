import {
  CheckIcon,
  FolderGit2Icon,
  GitBranchIcon,
  PlusIcon,
  ServerIcon,
  StarIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  formatProjectWriteFailure,
  projectRepositoryValidationSummary,
} from "../settings/JarvisProjects.logic";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import {
  CREATE_PROJECT_STEPS,
  CREATE_PROJECT_COLLISION_CATALOG_INPUT,
  addCreateProjectRepository,
  buildCreateProjectPayload,
  createProjectCollisionCatalogState,
  createInitialProjectDraft,
  removeCreateProjectRepository,
  setDefaultCreateProjectRepository,
  uniqueProjectSlugFromTitle,
  validateCreateProjectTitle,
  type CreateProjectDraft,
  type CreateProjectRepositoryDraft,
} from "./CreateProjectDialog.logic";

interface CreateProjectDialogProps {
  readonly open: boolean;
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
  readonly defaultEnvironmentId?: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
}

const STEP_LABELS = ["Details", "Repositories", "Review"] as const;

export function CreateProjectDialog({
  open,
  environments,
  defaultEnvironmentId,
  onOpenChange,
}: CreateProjectDialogProps) {
  const navigate = useNavigate();
  const nextRepositoryId = useRef(2);
  const wasOpenRef = useRef(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastFocusedStepRef = useRef(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState("");
  const [draft, setDraft] = useState<CreateProjectDraft>(() => createInitialProjectDraft());
  const [titleAttempted, setTitleAttempted] = useState(false);
  const [repositoriesAttempted, setRepositoriesAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedEnvironment =
    environments.find((environment) => environment.environmentId === selectedEnvironmentId) ??
    environments[0] ??
    null;
  const projectsQuery = useEnvironmentQuery(
    selectedEnvironment
      ? serverEnvironment.jarvisProjects({
          environmentId: selectedEnvironment.environmentId,
          input: CREATE_PROJECT_COLLISION_CATALOG_INPUT,
        })
      : null,
  );
  const createProject = useAtomCommand(serverEnvironment.createJarvisProject, {
    reportFailure: false,
  });
  const existingProjectIds = useMemo(
    () => new Set(projectsQuery.data?.projects?.map((project) => project.id) ?? []),
    [projectsQuery.data?.projects],
  );
  const collisionCatalogError =
    projectsQuery.error ??
    (projectsQuery.data?.ok === false
      ? (projectsQuery.data.error?.message ?? "Jarvis did not return the project catalog.")
      : null);
  const collisionCatalogState = createProjectCollisionCatalogState({
    hasEnvironment: selectedEnvironment !== null,
    querySucceeded: projectsQuery.data?.ok === true,
    queryFailed: collisionCatalogError !== null,
  });
  const payloadResult = useMemo(
    () => buildCreateProjectPayload(draft, existingProjectIds),
    [draft, existingProjectIds],
  );
  const generatedProjectKey = uniqueProjectSlugFromTitle(draft.title, existingProjectIds);
  const titleValidation = validateCreateProjectTitle(draft.title);
  const repositoryErrors = payloadResult.ok ? [] : payloadResult.repositoryErrors;
  const repositoryErrorSummary = payloadResult.ok
    ? ""
    : projectRepositoryValidationSummary({
        ok: false,
        repos: [],
        errors: payloadResult.repositoryErrors,
      });

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    const preferredEnvironment =
      environments.find((environment) => environment.environmentId === defaultEnvironmentId) ??
      environments[0] ??
      null;
    setSelectedEnvironmentId(preferredEnvironment?.environmentId ?? "");
    setDraft(createInitialProjectDraft());
    setStepIndex(0);
    setTitleAttempted(false);
    setRepositoriesAttempted(false);
    setSubmitError(null);
    setIsSubmitting(false);
    nextRepositoryId.current = 2;
    lastFocusedStepRef.current = 0;
  }, [defaultEnvironmentId, environments, open]);

  useEffect(() => {
    if (!open || environments.length === 0) return;
    if (environments.some((environment) => environment.environmentId === selectedEnvironmentId)) {
      return;
    }
    const preferredEnvironment =
      environments.find((environment) => environment.environmentId === defaultEnvironmentId) ??
      environments[0];
    setSelectedEnvironmentId(preferredEnvironment?.environmentId ?? "");
  }, [defaultEnvironmentId, environments, open, selectedEnvironmentId]);

  useEffect(() => {
    if (!open || lastFocusedStepRef.current === stepIndex) return;
    lastFocusedStepRef.current = stepIndex;
    stepHeadingRef.current?.focus();
  }, [open, stepIndex]);

  const updateRepository = (
    rowId: string,
    patch: Partial<Omit<CreateProjectRepositoryDraft, "rowId">>,
  ) => {
    setDraft((current) => ({
      ...current,
      repos: current.repos.map((repo) => (repo.rowId === rowId ? { ...repo, ...patch } : repo)),
    }));
    setSubmitError(null);
  };

  const goToNextStep = () => {
    setSubmitError(null);
    if (stepIndex === 0) {
      setTitleAttempted(true);
      if (
        !titleValidation.ok ||
        selectedEnvironment === null ||
        collisionCatalogState !== "ready"
      ) {
        return;
      }
    }
    if (stepIndex === 1) {
      setRepositoriesAttempted(true);
      if (!payloadResult.ok) return;
    }
    setStepIndex((current) => Math.min(CREATE_PROJECT_STEPS.length - 1, current + 1));
  };

  const handleCreate = async () => {
    setTitleAttempted(true);
    setRepositoriesAttempted(true);
    setSubmitError(null);
    if (!payloadResult.ok) {
      setStepIndex(payloadResult.titleError ? 0 : 1);
      return;
    }
    if (!selectedEnvironment || collisionCatalogState !== "ready" || isSubmitting) return;

    setIsSubmitting(true);
    const result = await createProject({
      environmentId: selectedEnvironment.environmentId,
      input: { input: payloadResult.payload },
    });
    if (result._tag === "Failure") {
      setIsSubmitting(false);
      if (!isAtomCommandInterrupted(result)) {
        setSubmitError(formatProjectWriteFailure(squashAtomCommandFailure(result)));
      }
      return;
    }
    if (!result.value.ok || !result.value.project) {
      setIsSubmitting(false);
      setSubmitError(
        formatProjectWriteFailure(
          result.value.error?.message ?? "Jarvis did not return the created project.",
        ),
      );
      return;
    }

    await projectsQuery.refresh();
    toastManager.add({
      type: "success",
      title: "Project created",
      description: result.value.project.name,
    });
    onOpenChange(false);
    await navigate({
      to: "/jarvis-project/$environmentId/$projectId",
      params: {
        environmentId: selectedEnvironment.environmentId,
        projectId: result.value.project.id,
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-2xl overflow-hidden">
        <DialogHeader className="gap-4 border-b border-border/70 bg-background pr-14">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
              <FolderGit2Icon className="size-3.5" />
              Project registry
            </div>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Name the project, attach its repositories, then review everything before creating it
              in Jarvis.
            </DialogDescription>
          </div>

          <ol className="grid grid-cols-3 gap-2" aria-label="Project creation progress">
            {STEP_LABELS.map((label, index) => {
              const isCurrent = index === stepIndex;
              const isComplete = index < stepIndex;
              return (
                <li
                  key={label}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5 py-2",
                    isCurrent
                      ? "border-primary/55 bg-primary/8"
                      : isComplete
                        ? "border-border bg-background"
                        : "border-border/70 bg-muted/35",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full border text-[10px] font-semibold",
                      isComplete
                        ? "border-primary bg-primary text-primary-foreground"
                        : isCurrent
                          ? "border-primary text-primary"
                          : "border-muted-foreground/30 text-muted-foreground",
                    )}
                  >
                    {isComplete ? <CheckIcon className="size-3" /> : index + 1}
                  </span>
                  <span className="truncate text-xs font-medium">
                    {label === "Repositories" ? (
                      <>
                        <span className="sm:hidden">Repos</span>
                        <span className="hidden sm:inline">Repositories</span>
                      </>
                    ) : (
                      label
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </DialogHeader>

        <DialogPanel className="min-h-72 space-y-5 bg-muted/15 py-5">
          <p className="sr-only" aria-live="polite">
            Step {stepIndex + 1} of {CREATE_PROJECT_STEPS.length}: {STEP_LABELS[stepIndex]}
          </p>
          {stepIndex === 0 ? (
            <div className="space-y-5">
              <div>
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold">
                  Project details
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a clear title. Cockpit generates the stable project key for you.
                </p>
              </div>

              {environments.length === 0 ? (
                <Alert variant="error">
                  <TriangleAlertIcon />
                  <AlertTitle>No Jarvis environment connected</AlertTitle>
                  <AlertDescription>
                    Connect a writable Jarvis environment before creating a project.
                  </AlertDescription>
                </Alert>
              ) : null}

              {collisionCatalogState === "loading" ? (
                <div
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Spinner className="size-4" />
                  Checking existing project keys
                </div>
              ) : null}

              {collisionCatalogState === "error" ? (
                <Alert variant="error">
                  <TriangleAlertIcon />
                  <AlertTitle>Could not check existing projects</AlertTitle>
                  <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{collisionCatalogError}</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={projectsQuery.refresh}
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {environments.length > 1 ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium">Environment</span>
                  <Select
                    value={selectedEnvironmentId}
                    onValueChange={(value) => {
                      if (value !== null) setSelectedEnvironmentId(value);
                    }}
                  >
                    <SelectTrigger aria-label="Project environment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {environments.map((environment) => (
                        <SelectItem
                          key={environment.environmentId}
                          value={environment.environmentId}
                        >
                          {environment.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </label>
              ) : null}

              <label className="grid gap-2">
                <span className="text-sm font-medium">Project title</span>
                <Input
                  id="create-project-title"
                  autoFocus
                  size="lg"
                  placeholder="e.g. Holo Table"
                  value={draft.title}
                  aria-invalid={titleAttempted && !titleValidation.ok}
                  aria-describedby={
                    titleAttempted && !titleValidation.ok
                      ? "create-project-title-error"
                      : "create-project-title-help"
                  }
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    setDraft((current) => ({ ...current, title }));
                    setSubmitError(null);
                  }}
                />
                {titleAttempted && !titleValidation.ok ? (
                  <span id="create-project-title-error" className="text-xs text-destructive">
                    {titleValidation.message}
                  </span>
                ) : (
                  <span id="create-project-title-help" className="text-xs text-muted-foreground">
                    Project key: <span className="font-mono">{generatedProjectKey}</span>
                  </span>
                )}
              </label>
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold">
                    Repositories
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Attach the repositories Jarvis should treat as part of this project.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const rowId = `repository-${nextRepositoryId.current++}`;
                    setDraft((current) => ({
                      ...current,
                      repos: addCreateProjectRepository(current.repos, rowId),
                    }));
                    setSubmitError(null);
                  }}
                >
                  <PlusIcon className="size-3.5" />
                  Add repository
                </Button>
              </div>

              {repositoriesAttempted && repositoryErrors.length > 0 ? (
                <Alert variant="error">
                  <TriangleAlertIcon />
                  <AlertTitle>Repositories need attention</AlertTitle>
                  <AlertDescription>{repositoryErrorSummary}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-3">
                {draft.repos.map((repo, index) => {
                  const rowErrors = repositoryErrors.filter((error) => error.rowIndex === index);
                  const nameError = rowErrors.find((error) => error.field === "name")?.message;
                  const remoteError = rowErrors.find((error) => error.field === "remote")?.message;
                  const remoteErrorId = `create-project-${repo.rowId}-remote-error`;
                  const nameErrorId = `create-project-${repo.rowId}-name-error`;
                  return (
                    <section
                      key={repo.rowId}
                      className="rounded-xl border border-border/75 bg-background p-4 shadow-xs/5"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <GitBranchIcon className="size-4 text-muted-foreground" />
                          Repository {index + 1}
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove repository ${index + 1}`}
                          disabled={draft.repos.length === 1}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              repos: removeCreateProjectRepository(current.repos, repo.rowId),
                            }))
                          }
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Remote</span>
                          <Input
                            placeholder="owner/repository"
                            value={repo.remote}
                            aria-invalid={repositoriesAttempted && Boolean(remoteError)}
                            aria-describedby={
                              repositoriesAttempted && remoteError ? remoteErrorId : undefined
                            }
                            onChange={(event) =>
                              updateRepository(repo.rowId, { remote: event.currentTarget.value })
                            }
                          />
                          {repositoriesAttempted && remoteError ? (
                            <span id={remoteErrorId} className="text-xs text-destructive">
                              {remoteError}
                            </span>
                          ) : null}
                        </label>
                        <label className="grid gap-1.5">
                          <span className="text-xs font-medium text-muted-foreground">
                            Label <span className="font-normal">(optional)</span>
                          </span>
                          <Input
                            placeholder="Uses repository name"
                            value={repo.name}
                            aria-invalid={repositoriesAttempted && Boolean(nameError)}
                            aria-describedby={
                              repositoriesAttempted && nameError ? nameErrorId : undefined
                            }
                            onChange={(event) =>
                              updateRepository(repo.rowId, { name: event.currentTarget.value })
                            }
                          />
                          {repositoriesAttempted && nameError ? (
                            <span id={nameErrorId} className="text-xs text-destructive">
                              {nameError}
                            </span>
                          ) : null}
                        </label>
                      </div>

                      <button
                        type="button"
                        aria-pressed={repo.default}
                        className={cn(
                          "mt-3 flex min-h-9 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm transition-colors",
                          repo.default
                            ? "border-primary/45 bg-primary/8 text-foreground"
                            : "border-border/70 text-muted-foreground hover:bg-muted/45 hover:text-foreground",
                        )}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            repos: setDefaultCreateProjectRepository(current.repos, repo.rowId),
                          }))
                        }
                      >
                        <StarIcon
                          className={cn("size-4", repo.default && "fill-primary text-primary")}
                        />
                        {repo.default ? "Default repository" : "Make default repository"}
                      </button>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : null}

          {stepIndex === 2 && payloadResult.ok ? (
            <div className="space-y-5">
              <div>
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-base font-semibold">
                  Review project
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirm the project details before writing them to Jarvis.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/75 bg-background p-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <FolderGit2Icon className="size-3.5" />
                    Project
                  </div>
                  <div className="mt-3 text-base font-semibold">{payloadResult.payload.name}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {payloadResult.payload.id}
                  </div>
                </div>
                <div className="rounded-xl border border-border/75 bg-background p-4">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <ServerIcon className="size-3.5" />
                    Environment
                  </div>
                  <div className="mt-3 text-base font-semibold">
                    {selectedEnvironment?.label ?? "Unavailable"}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {selectedEnvironment?.displayUrl ?? "No environment selected"}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/75 bg-background">
                <div className="border-b border-border/70 px-4 py-3 text-sm font-medium">
                  {payloadResult.payload.repos.length}{" "}
                  {payloadResult.payload.repos.length === 1 ? "repository" : "repositories"}
                </div>
                <div className="divide-y divide-border/65">
                  {payloadResult.payload.repos.map((repo) => (
                    <div
                      key={repo.remote}
                      className="flex min-w-0 items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{repo.name}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {repo.remote}
                        </div>
                      </div>
                      {repo.default ? (
                        <Badge variant="secondary">
                          <StarIcon className="size-3 fill-current" />
                          Default
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {submitError ? (
                <Alert variant="error">
                  <TriangleAlertIcon />
                  <AlertTitle>Could not create project</AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </DialogPanel>

        <DialogFooter className="border-t bg-background">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => {
              if (stepIndex === 0) {
                onOpenChange(false);
                return;
              }
              setStepIndex((current) => Math.max(0, current - 1));
              setSubmitError(null);
            }}
          >
            {stepIndex === 0 ? "Cancel" : "Back"}
          </Button>
          {stepIndex < CREATE_PROJECT_STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              disabled={environments.length === 0 || collisionCatalogState !== "ready"}
              onClick={goToNextStep}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting || collisionCatalogState !== "ready"}
              onClick={handleCreate}
            >
              {isSubmitting ? <Spinner className="size-4" /> : <PlusIcon className="size-4" />}
              {isSubmitting ? "Creating project" : "Create project"}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
