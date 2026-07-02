export function isLocalFilesystemCwd(cwd: string | null | undefined): cwd is string {
  if (!cwd) return false;
  if (/^[A-Za-z]:[\\/]/.test(cwd)) return true;
  return !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(cwd);
}

export function localFilesystemCwd(cwd: string | null | undefined): string | null {
  return isLocalFilesystemCwd(cwd) ? cwd : null;
}
