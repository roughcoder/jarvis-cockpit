import { CheckpointRef, ProjectId, ThreadId } from "@t3tools/contracts";

export const JARVIS_PROJECT_ID_PREFIX = "jarvis-run_";
export const JARVIS_THREAD_ID_PREFIX = "jarvis-session_";
const JARVIS_CHECKPOINT_REF_PREFIX = "jarvis:";
const JARVIS_CHECKPOINT_REF_SEPARATOR = ":";

export const jarvisProjectIdForRun = (runId: string): ProjectId =>
  ProjectId.make(`${JARVIS_PROJECT_ID_PREFIX}${runId}`);

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

export const jarvisCheckpointIdFromCheckpointRef = (
  checkpointRef: CheckpointRef | string | undefined,
): string | null => {
  if (checkpointRef === undefined) {
    return null;
  }
  const value = String(checkpointRef);
  if (!value.startsWith(JARVIS_CHECKPOINT_REF_PREFIX)) {
    return null;
  }
  const lastColonIndex = value.lastIndexOf(JARVIS_CHECKPOINT_REF_SEPARATOR);
  if (lastColonIndex <= JARVIS_CHECKPOINT_REF_PREFIX.length) {
    return null;
  }
  const checkpointId = decodeJarvisCheckpointRefComponent(value.slice(lastColonIndex + 1));
  return checkpointId.trim().length > 0 ? checkpointId : null;
};

function decodeJarvisCheckpointRefComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
