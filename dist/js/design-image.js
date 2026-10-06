import { supabase } from "./supabase.js";

const BUCKET = "custom_order_designs";

export async function createDesignUrl(path, expiresIn = 600) {
    const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, expiresIn);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Signed URL unavailable");
    return data.signedUrl;
}

function extensionFor(type, path) {
    const value = String(type || "").toLowerCase();
    if (value.includes("png")) return "png";
    if (value.includes("webp")) return "webp";
    if (value.includes("gif")) return "gif";
    if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
    const fromPath = String(path || "").match(/\.([a-z0-9]{2,5})$/i);
    return fromPath ? fromPath[1].toLowerCase() : "jpg";
}

function nameWithExtension(filename, type, path) {
    const ext = extensionFor(type, path);
    const base = String(filename || "").trim().replace(/\.[^.]+$/, "") || "design";
    return `${base}.${ext}`;
}

function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

export async function saveImageToDevice(url, filename) {
    let blobUrl = "";
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Image download failed");
        const blob = await response.blob();
        const name = nameWithExtension(filename, blob.type, url);
        const file = new File([blob], name, { type: blob.type || "image/jpeg" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: name });
            return "shared";
        }

        blobUrl = URL.createObjectURL(blob);
        triggerDownload(blobUrl, name);
        return "saved";
    } catch (error) {
        if (error?.name === "AbortError") return "cancelled";
        console.error("Image save failed:", error);
        window.open(url, "_blank", "noopener");
        return "opened";
    } finally {
        if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    }
}
