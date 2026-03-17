import { useState, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Upload, X, Image as ImageIcon, Link, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { fetchWithRetry } from "../lib/fetchWithRetry";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface MenuImageUploadProps {
  value: string; // Current image URL
  onChange: (url: string) => void; // Called with new URL after upload or manual entry
  customToken: string;
  /** Suggested dimensions text, e.g. "800 x 600 px" */
  recommendedSize?: string;
  /** Aspect ratio hint, e.g. "4:3" */
  aspectRatio?: string;
  /** Max file size in MB (default 5) */
  maxSizeMB?: number;
  /** Label to show above the component */
  label?: string;
  /** Context hint, e.g. "Menu Card", "Banner" */
  context?: string;
  /** Optional className for outer wrapper */
  className?: string;
}

export function MenuImageUpload({
  value,
  onChange,
  customToken,
  recommendedSize = "800 x 600 px",
  aspectRatio = "4:3",
  maxSizeMB = 5,
  label = "Image",
  context = "Menu Item",
  className = "",
}: MenuImageUploadProps) {
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState(value || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      // Validate type
      const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type. Please use PNG, JPG, WebP, or GIF.");
        return;
      }

      // Validate size
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast.error(`File too large. Maximum size is ${maxSizeMB}MB.`);
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetchWithRetry(`${API_BASE}/admin/upload-menu-image`, {
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

        onChange(data.imageUrl);
        toast.success("Image uploaded successfully!");
      } catch (error: any) {
        console.error("Menu image upload error:", error);
        toast.error(error.message || "Failed to upload image");
      } finally {
        setUploading(false);
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
      // Reset input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [handleFileSelect]
  );

  const handleUrlApply = useCallback(() => {
    const trimmed = urlInput.trim();
    if (trimmed) {
      onChange(trimmed);
      toast.success("Image URL applied!");
    }
  }, [urlInput, onChange]);

  const handleRemoveImage = useCallback(() => {
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

      {/* Image Guidelines Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-blue-700 font-medium text-xs">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Image Guidelines for {context}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-600">
          <div className="flex items-center gap-1">
            <span className="font-semibold">Size:</span> {recommendedSize}
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">Ratio:</span> {aspectRatio}
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">Max:</span> {maxSizeMB}MB
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">Format:</span> JPG, PNG, WebP
          </div>
        </div>
        <p className="text-[10px] text-blue-500 leading-tight">
          For best quality, use {recommendedSize} at {aspectRatio} ratio. Images will be auto-cropped to fit. Keep important content centered.
        </p>
      </div>

      {/* Current Image Preview */}
      {value && (
        <div className="relative group rounded-lg overflow-hidden border border-gray-200">
          <img
            src={value}
            alt="Current"
            className="w-full h-36 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemoveImage}
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
              ? "bg-orange-500 text-white"
              : "bg-gray-50 text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload File
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("url");
            setUrlInput(value || "");
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            mode === "url"
              ? "bg-orange-500 text-white"
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
              ? "border-orange-300 bg-orange-50 cursor-wait"
              : dragOver
              ? "border-orange-500 bg-orange-50 scale-[1.01]"
              : "border-gray-300 hover:border-orange-400 hover:bg-orange-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-sm font-medium text-orange-600">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Upload className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {dragOver ? "Drop image here" : "Click to upload or drag & drop"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  PNG, JPG, WebP, GIF - Max {maxSizeMB}MB
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
            placeholder="https://example.com/image.jpg"
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
            className="bg-orange-500 hover:bg-orange-600 text-white px-3"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}