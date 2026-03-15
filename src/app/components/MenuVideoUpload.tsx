import { useState, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Upload, X, Video, Link, Loader2, Info, Play } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface MenuVideoUploadProps {
  value: string; // Current video URL
  onChange: (url: string) => void;
  customToken: string;
  /** Max file size in MB (default 50) */
  maxSizeMB?: number;
  /** Label to show above the component */
  label?: string;
  /** Context hint, e.g. "Flash Sale", "Today's Special" */
  context?: string;
  /** Optional className for outer wrapper */
  className?: string;
}

export function MenuVideoUpload({
  value,
  onChange,
  customToken,
  maxSizeMB = 50,
  label = "Video",
  context = "Menu Item",
  className = "",
}: MenuVideoUploadProps) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState(value || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      // Validate type
      const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/mpeg"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type. Please use MP4, WebM, or MOV.");
        return;
      }

      // Validate size
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`File too large. Maximum size is ${maxSizeMB}MB.`);
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      // Simulate progress for better UX (actual upload is a single request)
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      try {
        const formData = new FormData();
        formData.append("video", file);

        const response = await fetch(`${API_BASE}/admin/upload-menu-video`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            "X-Custom-Auth": customToken,
          },
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Upload failed");
        }

        clearInterval(progressInterval);
        setUploadProgress(100);
        onChange(data.videoUrl);
        toast.success("Video uploaded successfully!");
      } catch (error: any) {
        console.error("Menu video upload error:", error);
        toast.error(error.message || "Failed to upload video");
      } finally {
        clearInterval(progressInterval);
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [customToken, maxSizeMB, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleFileSelect]
  );

  const handleUrlApply = useCallback(() => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onChange(trimmed);
      toast.success("Video URL applied!");
    }
  }, [urlInput, onChange]);

  const handleRemoveVideo = useCallback(() => {
    onChange("");
    setUrlInput("");
  }, [onChange]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>

      {/* Video Guidelines Box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-purple-700 font-medium text-xs">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Video Guidelines for {context}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-purple-600">
          <div className="flex items-center gap-1">
            <span className="font-semibold">Format:</span> MP4, WebM, MOV
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">Max:</span> {maxSizeMB}MB
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">Resolution:</span> 720p / 1080p
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">Codec:</span> H.264 preferred
          </div>
        </div>
        <p className="text-[10px] text-purple-500 leading-tight">
          For best mobile playback, use MP4 with H.264 codec. Keep file size reasonable for faster loading.
        </p>
      </div>

      {/* Current Video Preview */}
      {value && (
        <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-black">
          <video
            src={value}
            className="w-full h-36 object-cover"
            muted
            playsInline
            preload="metadata"
            onError={(e) => {
              (e.target as HTMLVideoElement).style.display = "none";
            }}
          />
          {/* Play icon overlay on preview */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemoveVideo}
            >
              <X className="w-4 h-4 mr-1" />
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Mode Toggle Tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            mode === "upload"
              ? "bg-purple-500 text-white"
              : "bg-gray-50 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Video
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("url");
            setUrlInput(value || "");
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            mode === "url"
              ? "bg-purple-500 text-white"
              : "bg-gray-50 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Link className="w-3.5 h-3.5" />
          Paste URL
        </button>
      </div>

      {/* Upload Mode */}
      {mode === "upload" && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
            uploading
              ? "border-purple-300 bg-purple-50 cursor-wait"
              : dragOver
              ? "border-purple-500 bg-purple-50 scale-[1.01]"
              : "border-gray-300 hover:border-purple-400 hover:bg-purple-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
              <p className="text-sm font-medium text-purple-600">
                Uploading... {Math.round(uploadProgress)}%
              </p>
              {/* Progress bar */}
              <div className="w-full max-w-[200px] h-2 bg-purple-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Video className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {dragOver ? "Drop video here" : "Click to upload or drag & drop"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  MP4, WebM, MOV - Max {maxSizeMB}MB
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* URL Mode */}
      {mode === "url" && (
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/video.mp4"
            className="flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleUrlApply();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={handleUrlApply}
            disabled={!urlInput.trim()}
            className="bg-purple-500 hover:bg-purple-600 text-white px-3"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
