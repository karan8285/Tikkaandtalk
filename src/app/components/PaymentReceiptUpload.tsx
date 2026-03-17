import { useState, useRef } from "react";
import { Camera, X, FileText, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { projectId, publicAnonKey } from "/utils/supabase/info";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface PaymentReceiptUploadProps {
  orderId: string;
  accessToken: string;
  onUploadComplete: (receiptUrl: string) => void;
  onClear: () => void;
  receiptUrl?: string | null;
  compact?: boolean;
}

export function PaymentReceiptUpload({
  orderId,
  accessToken,
  onUploadComplete,
  onClear,
  receiptUrl,
  compact = false,
}: PaymentReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please select a JPG, PNG, WebP image, or PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum 10MB.");
      return;
    }

    setFileName(file.name);
    setIsPdf(file.type === "application/pdf");

    // Show preview for images
    if (file.type !== "application/pdf") {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }

    // Upload immediately
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("orderId", orderId);

      const res = await fetch(`${API_BASE}/admin/upload-payment-receipt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": accessToken,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to upload receipt");
        clearFile();
        return;
      }

      const data = await res.json();
      onUploadComplete(data.imageUrl);
      toast.success("Receipt uploaded");
    } catch (error: any) {
      console.error("Receipt upload error:", error);
      toast.error("Failed to upload receipt");
      clearFile();
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setPreview(null);
    setFileName(null);
    setIsPdf(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClear();
  };

  // If already uploaded, show the result
  if (receiptUrl) {
    return (
      <div className="relative">
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-2">
          {preview && !isPdf ? (
            <img
              src={preview}
              alt="Receipt preview"
              className="w-10 h-10 rounded object-cover border border-green-300"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center border border-green-300">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-green-800 truncate">
              {fileName || "Receipt uploaded"}
            </p>
            <p className="text-[10px] text-green-600">Ready to submit</p>
          </div>
          <button
            type="button"
            onClick={clearFile}
            className="p-1 rounded-full hover:bg-green-200 text-green-600 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span className="text-xs text-blue-700 font-medium">
          Uploading receipt...
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={`w-full flex items-center gap-2 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-all active:scale-[0.98] ${
          compact ? "p-2" : "p-3"
        }`}
      >
        <div
          className={`rounded-full bg-gray-100 flex items-center justify-center shrink-0 ${
            compact ? "w-7 h-7" : "w-8 h-8"
          }`}
        >
          <Upload className={compact ? "w-3.5 h-3.5 text-gray-500" : "w-4 h-4 text-gray-500"} />
        </div>
        <div className="text-left">
          <p className={`font-medium text-gray-600 ${compact ? "text-[11px]" : "text-xs"}`}>
            Attach payment receipt
          </p>
          <p className="text-[10px] text-gray-400">
            JPG, PNG, WebP, PDF &middot; Max 10MB
          </p>
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

/** Small inline component to display a receipt link/thumbnail in payment history */
export function PaymentReceiptBadge({ receiptUrl }: { receiptUrl: string }) {
  return (
    <a
      href={receiptUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <FileText className="w-3 h-3" />
      Receipt
    </a>
  );
}
