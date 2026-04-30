interface Download {
  id: string;
  filePath: string; // OPFS path for storing the downloaded file
  objectUrl: string;
  totalByteSize?: number;
  bytesDownloaded: number;
  chunkSize: number; // in bytes
  pendingChunks?: Set<number>; // indices of chunks waiting to be downloaded
  status: DownloadStatus;
  error?: string;
  authenticated?: boolean;
  createdAt: number;
  updatedAt: number;
}

type DownloadStatus = "pending" | "in-progress" | "completed" | "failed";

export type { Download };
