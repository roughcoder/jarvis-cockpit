export interface FileDataUrlReadMessages {
  readonly nonStringResult: string;
  readonly readFailure: string;
}

/** UTF-8 encode text and base64 it (browser btoa needs a binary string). */
export function textToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

const DEFAULT_FILE_DATA_URL_READ_MESSAGES: FileDataUrlReadMessages = {
  nonStringResult: "Could not read image data.",
  readFailure: "Failed to read image.",
};

export function readFileAsDataUrl(
  file: File,
  messages: FileDataUrlReadMessages = DEFAULT_FILE_DATA_URL_READ_MESSAGES,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(messages.nonStringResult));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error(messages.readFailure));
    });
    reader.readAsDataURL(file);
  });
}
