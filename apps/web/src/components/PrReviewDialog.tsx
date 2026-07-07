import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { PR_REVIEW_DIMENSIONS, buildPrReviewOrchestratorPrompt } from "@t3tools/shared/prReview";
import { useNavigate } from "@tanstack/react-router";
import { LoaderIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { deriveReviewerOptions } from "./PrReviewDialog.logic";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { buildProjectConversationRouteParams } from "../jarvisProjectConversations.logic";
import { serverEnvironment } from "../state/server";
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

  const [selectedReviewers, setSelectedReviewers] = useState<ReadonlySet<string>>(new Set());
  const [selectedDimensions, setSelectedDimensions] = useState<ReadonlySet<string>>(
    new Set(DEFAULT_DIMENSIONS),
  );
  const [extraInstructions, setExtraInstructions] = useState("");
  const [post, setPost] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const models = useMemo(
    () =>
      reviewerOptions
        .filter((option) => selectedReviewers.has(option.key))
        .map((option) => option.model),
    [reviewerOptions, selectedReviewers],
  );

  const prompt = useMemo(
    () =>
      buildPrReviewOrchestratorPrompt({
        repo,
        prNumber,
        dimensions: dimensions.map((dimension) => dimension.id),
        models,
        ...(extraInstructions.trim() ? { extraInstructions } : {}),
        post,
      }),
    [repo, prNumber, dimensions, models, extraInstructions, post],
  );

  const toggle = (
    setter: (updater: (previous: ReadonlySet<string>) => ReadonlySet<string>) => void,
    id: string,
  ) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canSubmit = dimensions.length > 0 && !submitting;

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
        input: { title: reviewTitle },
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
    const sent = await sendTurn({
      environmentId,
      input: { projectId, threadId: String(threadId), input: { text: prompt } },
    });
    setSubmitting(false);
    if (sent._tag === "Failure") {
      if (!isAtomCommandInterrupted(sent)) {
        const failure = squashAtomCommandFailure(sent);
        setError(failure instanceof Error ? failure.message : "Could not send the review prompt.");
      }
      return;
    }

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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Review {repo} #{prNumber}
          </DialogTitle>
          <DialogDescription>
            Starts a review conversation in this project. Pick models and what to check; the
            orchestrator reviews the PR and{" "}
            {post ? "posts P1/P2/P3 comments to it" : "reports back here"}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Models to review with
            </h3>
            {reviewerOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No enabled provider models found — the orchestrator will use its default model.
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
                      onCheckedChange={() => toggle(setSelectedReviewers, option.key)}
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </label>
                ))}
              </div>
            )}
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
