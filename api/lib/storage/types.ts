/**
 * The storage contract.
 *
 * Two drivers implement it: `local` writes to the filesystem and needs no
 * infrastructure at all, and `s3` talks to MinIO or S3. The client flow is
 * identical for both — ask for an upload target, PUT the bytes there, then
 * send a message naming the attachment — so switching drivers changes nothing
 * above this line.
 */
export interface UploadTarget {
  /** Where the client PUTs the bytes. */
  url: string;
  /** Headers the client must send with the PUT, exactly as given. */
  headers: Record<string, string>;
  /** The opaque key the object will live under. */
  key: string;
  /** Unix seconds after which `url` stops working. */
  expiresAt: number;
}

export interface StorageDriver {
  readonly name: "local" | "s3";

  /** A URL the client may PUT `byteSize` bytes of `mimeType` to. */
  createUploadTarget(input: {
    key: string;
    mimeType: string;
    byteSize: number;
  }): Promise<UploadTarget> | UploadTarget;

  /** A URL the client may GET the object from, valid for a limited time. */
  createDownloadUrl(input: {
    key: string;
    fileName: string;
    mimeType: string;
    /** Render inline (images) rather than prompting a download. */
    inline: boolean;
  }): Promise<string> | string;

  /** Size in bytes, or null when the object is not there. */
  statObject(key: string): Promise<number | null>;

  /** Remove an object. Missing is not an error. */
  deleteObject(key: string): Promise<void>;
}
