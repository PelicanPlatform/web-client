export interface DownloadProgress {
  id: string;
  objectUrl: string;
  bytesDownloaded: number;
  totalByteSize: number;
  status: "pending" | "in-progress" | "completed" | "failed";
}

// Keep default export for backward compatibility
interface Download extends DownloadProgress {}
export default Download

// Url Type
export type UrlType = "collection" | "object"
