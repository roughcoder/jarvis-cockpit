import type {
  JarvisProjectFile,
  JarvisProjectFileUploadInput,
  JarvisProjectSourceImportInput,
} from "@t3tools/contracts";
import { useRef, useState, type DragEvent } from "react";
import {
  FileTextIcon,
  GithubIcon,
  Link2Icon,
  NotebookPenIcon,
  SparklesIcon,
  UploadCloudIcon,
} from "lucide-react";

import { buildProjectSourceFileUploadInput } from "./ProjectControlDeck.logic";
import { cn } from "../lib/utils";
import { readFileAsDataUrl } from "../lib/fileAttachments";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";

type IntakeMode = "file" | "link" | "note";

export type ProjectUploadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

interface ProjectKnowledgeIntakeProps {
  readonly files: ReadonlyArray<JarvisProjectFile>;
  readonly filesPending: boolean;
  readonly filesError: string | null;
  readonly uploading: boolean;
  readonly onUpload: (input: JarvisProjectFileUploadInput) => Promise<ProjectUploadResult>;
  readonly onImport: (input: JarvisProjectSourceImportInput) => Promise<ProjectUploadResult>;
  readonly onWriteNote: () => void;
}

const INTAKE_MODES: ReadonlyArray<{
  readonly id: IntakeMode;
  readonly label: string;
  readonly icon: typeof FileTextIcon;
}> = [
  { id: "file", label: "File", icon: FileTextIcon },
  { id: "link", label: "Link", icon: Link2Icon },
  { id: "note", label: "Note", icon: NotebookPenIcon },
];

function sourceKind(file: JarvisProjectFile): string {
  return file.artifact_type?.trim() || "document";
}

function sourceObservedAt(file: JarvisProjectFile): string {
  return file.observed_at ? formatRelativeTimeLabel(file.observed_at) : "Stored";
}

export function ProjectKnowledgeIntake({
  files,
  filesPending,
  filesError,
  uploading,
  onUpload,
  onImport,
  onWriteNote,
}: ProjectKnowledgeIntakeProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<IntakeMode>("file");
  const [dragActive, setDragActive] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [intakeError, setIntakeError] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    setIntakeError(null);
    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file, {
        nonStringResult: "Could not read the selected document.",
        readFailure: "The selected document could not be read.",
      });
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : "The document could not be read.");
      return;
    }
    const prepared = buildProjectSourceFileUploadInput({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
    });
    if (!prepared.ok) {
      setIntakeError(prepared.message);
      return;
    }
    const result = await onUpload(prepared.input);
    if (!result.ok) {
      setIntakeError(result.message);
    }
  };

  const uploadLink = async () => {
    setIntakeError(null);
    const url = linkUrl.trim();
    if (url.length === 0) {
      setIntakeError("Enter a complete HTTPS URL.");
      return;
    }
    const result = await onImport({
      url,
      ...(linkTitle.trim().length > 0 ? { title: linkTitle.trim() } : {}),
    });
    if (!result.ok) {
      setIntakeError(result.message);
      return;
    }
    setLinkUrl("");
    setLinkTitle("");
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files.item(0);
    if (file) void uploadFile(file);
  };

  return (
    <section className="project-control-deck-enter overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
      <div className="grid min-h-72 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]">
        <div className="relative p-5 sm:p-6">
          <div className="pointer-events-none absolute right-5 top-5 text-primary/12">
            <SparklesIcon className="size-20 stroke-[1]" />
          </div>
          <div className="relative max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Knowledge intake
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Give the project something to work with
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Drop a document, fetch a source, or write a decision. Jarvis keeps it with the project
              rather than a single conversation.
            </p>
          </div>

          <div
            className="relative mt-5"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragActive(false);
              }
            }}
            onDrop={handleDrop}
          >
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/35 p-1">
              {INTAKE_MODES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-medium transition-[background-color,color,box-shadow] duration-200",
                      mode === item.id
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-pressed={mode === item.id}
                    onClick={() => {
                      setMode(item.id);
                      setIntakeError(null);
                    }}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 min-h-32">
              {mode === "file" ? (
                <div
                  className={cn(
                    "flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed px-5 py-5 text-center transition-[background-color,border-color,transform] duration-200",
                    dragActive
                      ? "scale-[1.01] border-primary/60 bg-primary/8"
                      : "border-border bg-muted/18 hover:border-foreground/25 hover:bg-muted/28",
                  )}
                >
                  {uploading ? (
                    <Spinner className="size-5 text-primary" />
                  ) : (
                    <UploadCloudIcon className="size-5 text-muted-foreground" />
                  )}
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {uploading ? "Adding document to the project" : "Drop a document anywhere here"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Word, Markdown, PDF or text · up to 20 MB
                  </p>
                  <Button
                    size="xs"
                    variant="outline"
                    className="mt-3"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose file
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".doc,.docx,.md,.markdown,.pdf,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/markdown,text/plain"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.item(0);
                      if (file) void uploadFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              ) : mode === "link" ? (
                <div className="rounded-xl border border-border/70 bg-muted/18 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <GithubIcon className="size-4" />
                    Fetch a GitHub or web source
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(9rem,0.45fr)_minmax(0,1fr)_auto]">
                    <Input
                      value={linkTitle}
                      onChange={(event) => setLinkTitle(event.currentTarget.value)}
                      placeholder="Source title"
                      aria-label="Source title"
                      disabled={uploading}
                    />
                    <Input
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.currentTarget.value)}
                      placeholder="https://github.com/owner/repository"
                      aria-label="Source URL"
                      disabled={uploading}
                    />
                    <Button disabled={uploading} onClick={() => void uploadLink()}>
                      {uploading ? (
                        <Spinner className="size-4" />
                      ) : (
                        <Link2Icon className="size-4" />
                      )}
                      Fetch source
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cockpit fetches the public document on the server, then stores it with this
                    project.
                  </p>
                </div>
              ) : (
                <div className="flex min-h-32 items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/18 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Capture a project decision
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Write Markdown directly when there is no file yet.
                    </p>
                  </div>
                  <Button variant="outline" onClick={onWriteNote}>
                    <NotebookPenIcon className="size-4" />
                    Write note
                  </Button>
                </div>
              )}
            </div>

            {intakeError ? (
              <Alert variant="error" className="mt-3">
                <AlertTitle>Could not add source</AlertTitle>
                <AlertDescription>{intakeError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>

        <aside className="border-t border-border/70 bg-muted/18 p-5 xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Project sources
              </p>
              <p className="mt-1 text-sm text-foreground">
                {files.length === 0 ? "Nothing stored yet" : `${files.length} available to Jarvis`}
              </p>
            </div>
            <Badge variant="secondary">{files.length}</Badge>
          </div>

          {filesError ? (
            <p className="mt-5 text-sm text-destructive">{filesError}</p>
          ) : filesPending && files.length === 0 ? (
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading sources
            </div>
          ) : files.length === 0 ? (
            <div className="mt-5 border-l border-border pl-4">
              <p className="text-sm font-medium text-foreground">Start with the brief</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Requirements, research and architecture notes become shared project context.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-border/60">
              {files.slice(0, 5).map((file) => (
                <div key={file.doc_id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-2.5">
                    <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.title || file.doc_id}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {sourceKind(file)} · {sourceObservedAt(file)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
