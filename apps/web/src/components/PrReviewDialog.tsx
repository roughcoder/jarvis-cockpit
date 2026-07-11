import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { PR_REVIEW_DIMENSIONS, buildPrReviewOrchestratorPrompt } from "@t3tools/shared/prReview";
import { useNavigate } from "@tanstack/react-router";
import { LoaderIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  defaultReviewerKeys,
  deriveReviewerOptions,
  selectCommonReviewWorker,
  selectReviewOrchestratorWorker,
} from "./PrReviewDialog.logic";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { buildProjectConversationRouteParams } from "../jarvisProjectConversations.logic";
import { serverEnvironment } from "../state/server";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { toastManager } from "./ui/toast";

const DEFAULT_DIMENSIONS = ["correctness", "security"] as const;

interface PrReviewDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly repo: string;
  readonly prNumber: number;
}

export function PrReviewDialog({
  open,
  onOpenChange,
  environmentId,
  projectId,
  repo,
  prNumber,
}: PrReviewDialogProps) {
  const navigate = useNavigate();
  const providers =
    (useAtomValue(
      serverEnvironment.providersValueAtom(environmentId),
    ) as ReadonlyArray<ServerProvider> | null) ?? [];
  const reviewerOptions = useMemo(() => deriveReviewerOptions(providers), [providers]);
  const snapshotQuery = useEnvironmentQuery(
    serverEnvironment.jarvisSnapshot({ environmentId, input: {} }),
  );
  const projectThreadsQuery = useEnvironmentQuery(
    serverEnvironment.jarvisProjectThreads({
      environmentId,
      input: { projectId, includeArchived: false },
    }),
  );
  const workers = snapshotQuery.data?.snapshot?.workers ?? [];

  const [selectedReviewers, setSelectedReviewers] = useState<ReadonlySet<string>>(new Set());
  const [selectedDimensions, setSelectedDimensions] = useState<ReadonlySet<string>>(
    new Set(DEFAULT_DIMENSIONS),
  );
  const [extraInstructions, setExtraInstructions] = useState("");
  const [post, setPost] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedReviewers((current) => {
      const availableKeys = new Set(reviewerOptions.map((option) => option.key));
      const retained = new Set([...current].filter((key) => availableKeys.has(key)));
      return retained.size > 0 ? retained : defaultReviewerKeys(reviewerOptions);
    });
  }, [open, reviewerOptions]);

  const createThread = useAtomCommand(serverEnvironment.createJarvisProjectThread, {
    reportFailure: false,
  });
  const sendTurn = useAtomCommand(serverEnvironment.sendJarvisProjectThreadTurn, {
    reportFailure: false,
  });

  const dimensions = useMemo(
    () => PR_REVIEW_DIMENSIONS.filter((dimension) => selectedDimensions.has(dimension.id)),
    [selectedDimensions],
  );
  const reviewers = useMemo(
    () => reviewerOptions.filter((option) => selectedReviewers.has(option.key)),
    [reviewerOptions, selectedReviewers],
  );
  const workerId = useMemo(
    () => selectCommonReviewWorker({ workers, reviewers, repo }),
    [workers, reviewers, repo],
  );
  const orchestratorWorkerId = useMemo(
    () =>
      selectReviewOrchestratorWorker({
        workers,
        ...(workerId ? { childWorkerId: workerId } : {}),
      }),
    [workers, workerId],
  );

  const prompt = useMemo(
    () =>
      buildPrReviewOrchestratorPrompt({
        repo,
        prNumber,
        dimensions: dimensions.map((dimension) => dimension.id),
        reviewers,
        ...(workerId ? { workerId } : {}),
        ...(extraInstructions.trim() ? { extraInstructions } : {}),
        post,
      }),
    [repo, prNumber, dimensions, reviewers, workerId, extraInstructions, post],
  );

  const toggle = (
    setter: (updater: (previous: ReadonlySet<string>) => ReadonlySet<string>) => void,
    id: string,
    maxSelected?: number,
  ) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (maxSelected !== undefined && next.size >= maxSelected) {
          return previous;
        }
        next.add(id);
      }
      return next;
    });
  };

  const canSubmit =
    reviewers.length === 2 &&
    dimensions.length > 0 &&
    workerId !== undefined &&
    orchestratorWorkerId !== undefined &&
    !submitting;

  // Conversation title format: `review: #12 jarvis-cockpit` — the PR number and
  // the repo's short name (owner stripped).
  const repoShortName = repo.split("/").pop() || repo;
  const reviewTitle = `review: #${prNumber} ${repoShortName}`;

  const handleStart = async () => {
    setSubmitting(true);
    setError(null);

    const created = await createThread({
      environmentId,
      input: {
        projectId,
        input: {
          title: reviewTitle,
          chat_type: "orchestrator",
          engine: "codex",
          model: "gpt-5.5",
          worker_id: orchestratorWorkerId,
        },
      },
    });
    if (created._tag === "Failure") {
      setSubmitting(false);
      if (!isAtomCommandInterrupted(created)) {
        const failure = squashAtomCommandFailure(created);
        setError(failure instanceof Error ? failure.message : "Could not start the review.");
      }
      return;
    }
    if (created.value.ok !== true || !created.value.thread) {
      setSubmitting(false);
      setError(created.value.error?.message ?? "Could not create the review conversation.");
      return;
    }

    const threadId = created.value.thread.thread_id;
    projectThreadsQuery.refresh();
    setSubmitting(false);
    onOpenChange(false);
    toastManager.add({
      type: "info",
      title: "PR review started",
      description: `${repo} #${prNumber}`,
    });
    void navigate({
      to: "/jarvis-project/$environmentId/$projectId/$threadId",
      params: buildProjectConversationRouteParams({
        environmentId,
        projectId,
        threadId: String(threadId),
      }),
    });
    void sendTurn({
      environmentId,
      input: { projectId, threadId: String(threadId), input: { text: prompt } },
    }).then((sent) => {
      if (sent._tag === "Failure" && !isAtomCommandInterrupted(sent)) {
        const failure = squashAtomCommandFailure(sent);
        toastManager.add({
          type: "error",
          title: "PR review orchestration failed",
          description:
            failure instanceof Error ? failure.message : "Could not send the review prompt.",
        });
        return;
      }
      projectThreadsQuery.refresh();
      snapshotQuery.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Review {repo} #{prNumber}
          </DialogTitle>
          <DialogDescription>
            Starts a parent conversation in this project. Choose exactly two reviewers; the
            orchestrator creates their child chats, reconciles both results, and{" "}
            {post ? "posts P1/P2/P3 comments to it" : "reports back here"}.
            <span className="mt-1 block">
              Requires Jarvis authority to create worker sessions
              {post ? " and comment on pull requests" : ""}.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Reviewers ({reviewers.length}/2)
            </h3>
            {reviewerOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No enabled provider models found. Two available reviewers are required.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {reviewerOptions.map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedReviewers.has(option.key)}
                      disabled={!selectedReviewers.has(option.key) && reviewers.length >= 2}
                      onCheckedChange={() => toggle(setSelectedReviewers, option.key, 2)}
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
            {reviewers.length === 2 && workerId === undefined ? (
              <p className="text-xs text-destructive">
                No healthy repo-capable worker has two free slots for both reviewers.
              </p>
            ) : null}
            {workerId !== undefined && orchestratorWorkerId === undefined ? (
              <p className="text-xs text-destructive">
                No Codex worker has a separate free slot for the parent orchestrator.
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Review dimensions
            </h3>
            <div className="flex flex-wrap gap-2">
              {PR_REVIEW_DIMENSIONS.map((dimension) => (
                <label
                  key={dimension.id}
                  className="flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-sm"
                >
                  <Checkbox
                    checked={selectedDimensions.has(dimension.id)}
                    onCheckedChange={() => toggle(setSelectedDimensions, dimension.id)}
                  />
                  <span>{dimension.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Extra instructions
            </h3>
            <Textarea
              value={extraInstructions}
              onChange={(event) => setExtraInstructions(event.currentTarget.value)}
              placeholder="Optional — measure against X, Y, or Z; apply a specific skill; focus areas…"
              rows={3}
            />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Post comments to the PR</p>
                <p className="text-xs text-muted-foreground">
                  When off, the orchestrator reports findings in the conversation instead.
                </p>
              </div>
              <Switch checked={post} onCheckedChange={setPost} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Prompt preview
            </h3>
            <pre className="max-h-40 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
              {prompt}
            </pre>
          </section>

          {error ? <Badge variant="destructive">{error}</Badge> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleStart()} disabled={!canSubmit}>
            {submitting ? <LoaderIcon className="size-4 animate-spin" /> : null}
            Start review
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
