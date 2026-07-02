import { CheckpointRef, ProjectId, ThreadId } from "@t3tools/contracts";

export const JARVIS_PROJECT_ID_PREFIX = "jarvis-run_";
export const JARVIS_THREAD_ID_PREFIX = "jarvis-session_";
const JARVIS_CHECKPOINT_REF_PREFIX = "jarvis:";
const JARVIS_CHECKPOINT_REF_SEPARATOR = ":";

export const jarvisProjectIdForRun = (runId: string): ProjectId =>
  ProjectId.make(`${JARVIS_PROJECT_ID_PREFIX}${runId}`);

export const jarvisRunIdFromProjectId = (projectId: ProjectId | string): string | null => {
  const value = String(projectId);
  return value.startsWith(JARVIS_PROJECT_ID_PREFIX)
    ? value.slice(JARVIS_PROJECT_ID_PREFIX.length)
    : null;
};

export const jarvisThreadIdForSession = (sessionRef: string): ThreadId =>
  ThreadId.make(`${JARVIS_THREAD_ID_PREFIX}${sessionRef}`);

export const isJarvisThreadId = (threadId: string): boolean =>
  threadId.startsWith(JARVIS_THREAD_ID_PREFIX);

export const jarvisSessionIdFromThreadId = (threadId: string): string | null =>
  isJarvisThreadId(threadId) ? threadId.slice(JARVIS_THREAD_ID_PREFIX.length) : null;

export const jarvisCheckpointRefForCheckpoint = (
  sessionRef: string,
  checkpointId: string,
): CheckpointRef =>
  CheckpointRef.make(
    `${JARVIS_CHECKPOINT_REF_PREFIX}${encodeURIComponent(sessionRef)}${JARVIS_CHECKPOINT_REF_SEPARATOR}${encodeURIComponent(checkpointId)}`,
  );

export type JarvisCheckpointRefParts = {
  readonly sessionRef: string;
  readonly checkpointId: string;
};

export const jarvisCheckpointRefPartsFromCheckpointRef = (
  checkpointRef: CheckpointRef | string | undefined,
): JarvisCheckpointRefParts | null => {
  if (checkpointRef === undefined) {
    return null;
  }
  const value = String(checkpointRef);
  if (!value.startsWith(JARVIS_CHECKPOINT_REF_PREFIX)) {
    return null;
  }
  const encodedParts = value.slice(JARVIS_CHECKPOINT_REF_PREFIX.length).split(":");
  if (encodedParts.length !== 2) {
    return null;
  }
  const [encodedSessionRef, encodedCheckpointId] = encodedParts;
  if (encodedSessionRef === undefined || encodedCheckpointId === undefined) {
    return null;
  }
  const sessionRef = decodeJarvisCheckpointRefComponent(encodedSessionRef);
  const checkpointId = decodeJarvisCheckpointRefComponent(encodedCheckpointId);
  if (sessionRef.trim().length === 0 || checkpointId.trim().length === 0) {
    return null;
  }
  return { sessionRef, checkpointId };
};

export const jarvisCheckpointIdFromCheckpointRef = (
  checkpointRef: CheckpointRef | string | undefined,
): string | null => {
  return jarvisCheckpointRefPartsFromCheckpointRef(checkpointRef)?.checkpointId ?? null;
};

function decodeJarvisCheckpointRefComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
