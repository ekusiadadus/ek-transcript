"use client";

import { useState, useRef, useCallback, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { getUploadUrl } from "../../lib/graphql";
import styles from "./page.module.css";

type FileStatus = "pending" | "uploading" | "success" | "error";

interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  errorMessage?: string;
  key?: string;
}

const MAX_FILES = 20;
const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function UploadForm() {
  const router = useRouter();
  const { getAccessToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [segment, setSegment] = useState("HEMS");
  const [residenceType, setResidenceType] = useState<"detached" | "rental">("detached");
  const [isDragging, setIsDragging] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "MP4, MOV, AVI, WebM形式のファイルを選択してください";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "ファイルサイズは3GB以下にしてください";
    }
    return null;
  }, []);

  const handleFilesSelect = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);

    // Check max files limit
    if (files.length + fileArray.length > MAX_FILES) {
      setStatusMessage(`最大20ファイルまでアップロード可能です`);
      setGlobalStatus("error");
      return;
    }

    const newFiles: FileItem[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        newFiles.push({
          id: generateId(),
          file,
          status: "pending",
          progress: 0,
        });
      }
    }

    if (errors.length > 0) {
      setStatusMessage(errors.join("\n"));
      setGlobalStatus("error");
    } else {
      setStatusMessage("");
      setGlobalStatus("idle");
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  }, [files.length, validateFile]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      handleFilesSelect(selectedFiles);
    }
    // Reset input value to allow selecting the same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleFilesSelect(droppedFiles);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setStatusMessage("");
    setGlobalStatus("idle");
  };

  const handleClearAll = () => {
    setFiles([]);
    setGlobalStatus("idle");
    setStatusMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadSingleFile = async (fileItem: FileItem): Promise<void> => {
    const { id, file } = fileItem;

    // Update status to uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "uploading" as FileStatus, progress: 0 } : f
      )
    );

    try {
      // Get presigned URL
      const { uploadUrl, key } = await getUploadUrl(file.name, file.type, segment);

      // Upload to S3 with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === id ? { ...f, progress: percentComplete } : f
              )
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === id
                  ? { ...f, status: "success" as FileStatus, progress: 100, key }
                  : f
              )
            );
            resolve();
          } else {
            reject(new Error(`アップロードに失敗しました (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("ネットワークエラーが発生しました"));
        xhr.send(file);
      });
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "error" as FileStatus,
                errorMessage: error instanceof Error ? error.message : "アップロードに失敗しました",
              }
            : f
        )
      );
      throw error;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const token = await getAccessToken();
    if (!token) {
      setStatusMessage("認証トークンを取得できませんでした");
      setGlobalStatus("error");
      return;
    }

    setGlobalStatus("uploading");
    setStatusMessage("アップロード中...");

    const pendingFiles = files.filter((f) => f.status === "pending" || f.status === "error");
    let successCount = 0;
    let errorCount = 0;

    // Upload files sequentially to avoid overwhelming the server
    for (const fileItem of pendingFiles) {
      try {
        await uploadSingleFile(fileItem);
        successCount++;
      } catch {
        errorCount++;
      }
    }

    if (errorCount === 0) {
      setGlobalStatus("success");
      setStatusMessage(`${successCount}件のファイルをアップロードしました`);
      // Redirect to dashboard after 3 seconds
      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
    } else if (successCount > 0) {
      setGlobalStatus("error");
      setStatusMessage(`${successCount}件成功、${errorCount}件失敗`);
    } else {
      setGlobalStatus("error");
      setStatusMessage("全てのアップロードに失敗しました");
    }
  };

  const isUploading = globalStatus === "uploading";
  const hasFiles = files.length > 0;
  const hasPendingFiles = files.some((f) => f.status === "pending" || f.status === "error");

  const dropzoneClasses = [
    styles.dropzone,
    isDragging ? styles.dropzoneActive : "",
    isUploading ? styles.dropzoneDisabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  const totalProgress = files.length > 0
    ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
    : 0;

  return (
    <div className={styles.content}>
      <div
        className={dropzoneClasses}
        onClick={!isUploading ? handleClick : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleInputChange}
          className={styles.hiddenInput}
          disabled={isUploading}
        />
        <div className={styles.dropzoneIcon}>
          {isUploading ? "..." : hasFiles ? "✓" : "+"}
        </div>
        <h2 className={styles.dropzoneTitle}>
          {hasFiles
            ? `${files.length}ファイル選択済み`
            : "ファイルをドロップまたはクリックして選択"}
        </h2>
        <p className={styles.dropzoneText}>
          MP4, MOV, AVI, WebM (最大3GB、20ファイルまで)
        </p>
      </div>

      {hasFiles && (
        <div className={styles.fileList}>
          <div className={styles.fileListHeader}>
            <span className={styles.fileCount}>{files.length}ファイル</span>
            {!isUploading && (
              <button
                type="button"
                className={styles.clearAllButton}
                onClick={handleClearAll}
              >
                全て削除
              </button>
            )}
          </div>
          {files.map((fileItem) => (
            <div key={fileItem.id} className={styles.fileItem}>
              <div className={styles.fileItemInfo}>
                <p className={styles.fileName}>{fileItem.file.name}</p>
                <p className={styles.fileSize}>{formatFileSize(fileItem.file.size)}</p>
              </div>
              <div className={styles.fileItemStatus}>
                {fileItem.status === "uploading" && (
                  <div className={styles.fileProgress}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${fileItem.progress}%` }}
                      />
                    </div>
                    <span className={styles.progressText}>{fileItem.progress}%</span>
                  </div>
                )}
                {fileItem.status === "success" && (
                  <span className={styles.statusSuccess}>✓</span>
                )}
                {fileItem.status === "error" && (
                  <span className={styles.statusError} title={fileItem.errorMessage}>
                    ✗
                  </span>
                )}
                {fileItem.status === "pending" && !isUploading && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => handleRemoveFile(fileItem.id)}
                    aria-label="削除"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasFiles && !isUploading && globalStatus !== "success" && (
        <>
          <div className={styles.residenceTypeSelect}>
            <label className={styles.segmentLabel}>住居タイプ（全ファイル共通）</label>
            <div className={styles.residenceTypeButtons}>
              <button
                type="button"
                className={`${styles.residenceTypeButton} ${residenceType === "detached" ? styles.residenceTypeButtonActive : ""}`}
                onClick={() => setResidenceType("detached")}
              >
                <span className={styles.residenceTypeIcon}>🏠</span>
                <span className={styles.residenceTypeLabel}>戸建て</span>
              </button>
              <button
                type="button"
                className={`${styles.residenceTypeButton} ${residenceType === "rental" ? styles.residenceTypeButtonActive : ""}`}
                onClick={() => setResidenceType("rental")}
              >
                <span className={styles.residenceTypeIcon}>🏢</span>
                <span className={styles.residenceTypeLabel}>賃貸</span>
              </button>
            </div>
          </div>
          <div className={styles.segmentSelect}>
            <label className={styles.segmentLabel} htmlFor="segment">
              セグメント（全ファイル共通）
            </label>
            <select
              id="segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className={styles.segmentInput}
            >
              <option value="HEMS">HEMS</option>
              <option value="EV">EV</option>
              <option value="Solar">Solar</option>
              <option value="Storage">Storage</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </>
      )}

      {isUploading && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${totalProgress}%` }}
            />
          </div>
          <p className={styles.progressText}>全体進捗: {totalProgress}%</p>
        </div>
      )}

      {statusMessage && (
        <div
          className={`${styles.statusMessage} ${
            globalStatus === "success"
              ? styles.statusSuccess
              : globalStatus === "error"
                ? styles.statusError
                : styles.statusInfo
          }`}
        >
          {statusMessage}
        </div>
      )}

      {hasFiles && globalStatus !== "success" && (
        <div className={styles.actions}>
          <button
            className={styles.uploadButton}
            onClick={handleUpload}
            disabled={isUploading || !hasPendingFiles}
          >
            {isUploading ? "アップロード中..." : "アップロード開始"}
          </button>
          <button
            className={styles.cancelButton}
            onClick={handleClearAll}
            disabled={isUploading}
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Upload Video</h1>
        <Link href="/dashboard" className={styles.backLink}>
          Dashboard
        </Link>
      </header>
      <UploadForm />
    </div>
  );
}
