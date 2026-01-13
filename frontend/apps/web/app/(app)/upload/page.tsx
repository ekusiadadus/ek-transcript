"use client";

/**
 * Upload page - Video upload with drag & drop (US-5, US-6)
 */
import { useState, useCallback, useRef, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { getUploadUrl } from "../../../lib/graphql";
import styles from "./page.module.css";

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "completed" | "failed";
  error?: string;
}

const ACCEPTED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
const MAX_FILES = 20;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function UploadPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: UploadFile[] = [];

    Array.from(newFiles).forEach((file) => {
      // Check type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert(`${file.name}: サポートされていないファイル形式です`);
        return;
      }

      // Check size
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name}: ファイルサイズが大きすぎます (最大 3GB)`);
        return;
      }

      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        progress: 0,
        status: "pending",
      });
    });

    setFiles((prev) => {
      const combined = [...prev, ...validFiles];
      if (combined.length > MAX_FILES) {
        alert(`最大 ${MAX_FILES} ファイルまでアップロードできます`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(e.target.files);
      }
    },
    [addFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const uploadFile = async (uploadFile: UploadFile): Promise<boolean> => {
    try {
      // Update status
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: "uploading" as const } : f
        )
      );

      // Get presigned URL
      const { uploadUrl } = await getUploadUrl(
        uploadFile.file.name,
        uploadFile.file.type
      );

      // Upload to S3
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setFiles((prev) =>
              prev.map((f) => (f.id === uploadFile.id ? { ...f, progress } : f))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", uploadFile.file.type);
        xhr.send(uploadFile.file);
      });

      // Update status
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: "completed" as const, progress: 100 }
            : f
        )
      );

      return true;
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: "failed" as const,
                error: error instanceof Error ? error.message : "Upload failed",
              }
            : f
        )
      );
      return false;
    }
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setUploading(true);

    // Upload files sequentially
    for (const file of pendingFiles) {
      await uploadFile(file);
    }

    setUploading(false);

    // Check if all completed
    const allCompleted = files.every(
      (f) => f.status === "completed" || f.status === "failed"
    );
    if (allCompleted) {
      const successCount = files.filter((f) => f.status === "completed").length;
      if (successCount > 0) {
        alert(
          `${successCount} ファイルのアップロードが完了しました。分析を開始します。`
        );
        router.push("/dashboard");
      }
    }
  };

  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.authPrompt}>
          <h1 className={styles.authTitle}>サインインが必要です</h1>
          <p className={styles.authDescription}>
            動画をアップロードするにはサインインしてください。
          </p>
          <button onClick={() => router.push("/")} className={styles.signInButton}>
            サインイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>動画アップロード</h1>
        <Link href="/dashboard" className={styles.backLink}>
          ← Dashboard に戻る
        </Link>
      </div>

      {/* Dropzone */}
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneDragging : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={handleFileChange}
          className={styles.hiddenInput}
        />
        <div className={styles.dropzoneContent}>
          <span className={styles.dropzoneIcon}>📁</span>
          <p className={styles.dropzoneText}>
            ドラッグ&ドロップ または クリックしてファイルを選択
          </p>
          <p className={styles.dropzoneHint}>
            MP4, MOV, AVI, WebM (最大 3GB, 20ファイルまで)
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className={styles.fileList}>
          <h2 className={styles.fileListTitle}>
            アップロードファイル ({files.length})
          </h2>

          {files.map((uploadFile) => (
            <div key={uploadFile.id} className={styles.fileItem}>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{uploadFile.file.name}</span>
                <span className={styles.fileSize}>
                  {formatFileSize(uploadFile.file.size)}
                </span>
              </div>

              <div className={styles.fileStatus}>
                {uploadFile.status === "pending" && (
                  <span className={styles.statusPending}>待機中</span>
                )}
                {uploadFile.status === "uploading" && (
                  <span className={styles.statusUploading}>
                    {uploadFile.progress}%
                  </span>
                )}
                {uploadFile.status === "completed" && (
                  <span className={styles.statusCompleted}>完了</span>
                )}
                {uploadFile.status === "failed" && (
                  <span className={styles.statusFailed}>
                    {uploadFile.error || "失敗"}
                  </span>
                )}

                {uploadFile.status === "pending" && (
                  <button
                    className={styles.removeButton}
                    onClick={() => removeFile(uploadFile.id)}
                  >
                    ✕
                  </button>
                )}
              </div>

              {uploadFile.status === "uploading" && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${uploadFile.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}

          <div className={styles.actions}>
            <button
              className={styles.clearButton}
              onClick={() => setFiles([])}
              disabled={uploading}
            >
              すべてクリア
            </button>
            <button
              className={styles.uploadButton}
              onClick={handleUpload}
              disabled={
                uploading || files.filter((f) => f.status === "pending").length === 0
              }
            >
              {uploading ? "アップロード中..." : "アップロード開始"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
