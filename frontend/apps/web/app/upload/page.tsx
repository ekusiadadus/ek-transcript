"use client";

import { useState, useRef, useCallback, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { getUploadUrl } from "../../lib/graphql";
import styles from "./page.module.css";

type UploadStatus = "idle" | "uploading" | "success" | "error";

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
  const [file, setFile] = useState<File | null>(null);
  const [segment, setSegment] = useState("HEMS");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const acceptedTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!acceptedTypes.includes(selectedFile.type)) {
      setStatusMessage("MP4, MOV, AVI, WebM形式のファイルを選択してください");
      setUploadStatus("error");
      return;
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      setStatusMessage("ファイルサイズは500MB以下にしてください");
      setUploadStatus("error");
      return;
    }
    setFile(selectedFile);
    setUploadStatus("idle");
    setStatusMessage("");
    setProgress(0);
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
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
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleCancel = () => {
    setFile(null);
    setUploadStatus("idle");
    setStatusMessage("");
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploadStatus("uploading");
      setStatusMessage("アップロード準備中...");
      setProgress(0);

      const token = await getAccessToken();
      if (!token) {
        throw new Error("認証トークンを取得できませんでした");
      }

      // GraphQL API経由でPresigned URLを取得
      setProgress(10);
      const { uploadUrl, key } = await getUploadUrl(file.name, file.type, segment);

      // S3にアップロード（XHRで進捗追跡）
      setStatusMessage("アップロード中...");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 80) + 10;
            setProgress(percentComplete);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            setProgress(100);
            resolve();
          } else {
            reject(new Error(`アップロードに失敗しました (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("ネットワークエラーが発生しました"));
        xhr.send(file);
      });

      setUploadStatus("success");
      setStatusMessage(`アップロード完了！ キー: ${key}`);

      // 3秒後にダッシュボードへリダイレクト
      setTimeout(() => {
        router.push("/dashboard");
      }, 3000);
    } catch (error) {
      setUploadStatus("error");
      setStatusMessage(
        error instanceof Error ? error.message : "アップロードに失敗しました"
      );
    }
  };

  const dropzoneClasses = [
    styles.dropzone,
    isDragging ? styles.dropzoneActive : "",
    uploadStatus === "uploading" ? styles.dropzoneDisabled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.content}>
      <div
        className={dropzoneClasses}
        onClick={uploadStatus !== "uploading" ? handleClick : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleInputChange}
          className={styles.hiddenInput}
          disabled={uploadStatus === "uploading"}
        />
        <div className={styles.dropzoneIcon}>
          {uploadStatus === "uploading" ? "..." : file ? "o" : "+"}
        </div>
        <h2 className={styles.dropzoneTitle}>
          {file ? file.name : "ファイルをドロップまたはクリックして選択"}
        </h2>
        <p className={styles.dropzoneText}>
          MP4, MOV, AVI, WebM (最大500MB)
        </p>
      </div>

      {file && (
        <div className={styles.fileInfo}>
          <p className={styles.fileName}>{file.name}</p>
          <p className={styles.fileSize}>{formatFileSize(file.size)}</p>
        </div>
      )}

      {file && uploadStatus !== "uploading" && uploadStatus !== "success" && (
        <div className={styles.segmentSelect}>
          <label className={styles.segmentLabel} htmlFor="segment">
            セグメント
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
      )}

      {uploadStatus === "uploading" && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className={styles.progressText}>{progress}%</p>
        </div>
      )}

      {statusMessage && (
        <div
          className={`${styles.statusMessage} ${
            uploadStatus === "success"
              ? styles.statusSuccess
              : uploadStatus === "error"
                ? styles.statusError
                : styles.statusInfo
          }`}
        >
          {statusMessage}
        </div>
      )}

      {file && uploadStatus !== "success" && (
        <div className={styles.actions}>
          <button
            className={styles.uploadButton}
            onClick={handleUpload}
            disabled={uploadStatus === "uploading"}
          >
            {uploadStatus === "uploading" ? "アップロード中..." : "アップロード開始"}
          </button>
          <button
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={uploadStatus === "uploading"}
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
