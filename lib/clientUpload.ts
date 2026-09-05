import { isMediaVideo } from "./mediaUtils";

export interface UploadOptions {
  file: File;
  firstName?: string;
  lastName?: string;
  greeting?: string;
  token?: string;
  adminPassword?: string;
  onProgress?: (percent: number) => void;
}

export interface UploadResult {
  url: string;
  token?: string;
  item?: any;
}

/**
 * Uploads media (images or videos) directly to Cloudinary using signed upload
 * to completely bypass server payload limits (such as Netlify 6MB body limit).
 * Falls back to standard FormData /api/upload if signature fails.
 */
export async function uploadMediaWithProgress(options: UploadOptions): Promise<UploadResult> {
  const { file, firstName = "", lastName = "", greeting = "", token = "", adminPassword = "", onProgress } = options;

  // 1. Try Direct Signed Upload to Cloudinary
  try {
    const signRes = await fetch("/api/cloudinary/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "timrat-community", tags: "timrat_new_year" }),
    });

    if (signRes.ok) {
      const signData = await signRes.json();
      const { signature, timestamp, apiKey, cloudName, folder, tags } = signData;

      if (signature && apiKey && cloudName) {
        // Prepare FormData for Cloudinary
        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", apiKey);
        formData.append("timestamp", timestamp.toString());
        formData.append("folder", folder);
        formData.append("tags", tags);
        formData.append("signature", signature);

        // Upload using XMLHttpRequest to get accurate progress events
        const cldResult = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "https://api.cloudinary.com/v1_1/" + cloudName + "/auto/upload");

          if (onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 90);
                onProgress(pct);
              }
            };
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const parsed = JSON.parse(xhr.responseText);
                resolve(parsed);
              } catch (err) {
                reject(new Error("Invalid Cloudinary response JSON"));
              }
            } else {
              let msg = "Cloudinary upload failed";
              try {
                const errJson = JSON.parse(xhr.responseText);
                msg = errJson.error?.message || msg;
              } catch {}
              reject(new Error(msg));
            }
          };

          xhr.onerror = () => reject(new Error("Network error uploading to Cloudinary"));
          xhr.ontimeout = () => reject(new Error("Upload to Cloudinary timed out"));
          xhr.send(formData);
        });

        if (onProgress) onProgress(95);

        // Register the uploaded asset with our backend
        const regRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directUpload: true,
            url: cldResult.secure_url || cldResult.url,
            publicId: cldResult.public_id,
            resourceType: cldResult.resource_type || (isMediaVideo(cldResult.secure_url) ? "video" : "image"),
            firstName,
            lastName,
            greeting,
            token,
            adminPassword,
          }),
        });

        if (!regRes.ok) {
          const errData = await regRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to register upload with server");
        }

        if (onProgress) onProgress(100);
        return await regRes.json();
      }
    }
  } catch (directErr) {
    console.warn("Direct Cloudinary upload failed or unsupported, falling back to server proxy upload:", directErr);
  }

  // 2. Fallback: Proxy upload via /api/upload
  const formData = new FormData();
  formData.append("file", file);
  formData.append("firstName", firstName);
  formData.append("lastName", lastName);
  formData.append("greeting", greeting);
  formData.append("token", token);
  if (adminPassword) formData.append("adminPassword", adminPassword);

  const fallbackRes = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!fallbackRes.ok) {
    const errData = await fallbackRes.json().catch(() => ({}));
    throw new Error(errData.error || "שגיאה בהעלאת הקובץ");
  }

  if (onProgress) onProgress(100);
  return await fallbackRes.json();
}

/**
 * Uploads a video file directly to Cloudinary (timrat-community/ai-videos)
 * bypassing serverless body limits. Returns the secure URL.
 */
export async function uploadVideoToCloudinary(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: "timrat-community/ai-videos", tags: "timrat_ai_video" }),
  });

  if (!signRes.ok) {
    throw new Error("Failed to get video upload signature");
  }

  const { signature, timestamp, apiKey, cloudName, folder, tags } = await signRes.json();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp.toString());
  formData.append("folder", folder);
  formData.append("tags", tags);
  formData.append("signature", signature);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json.secure_url || json.url);
        } catch (err) {
          reject(new Error("Invalid response from video upload"));
        }
      } else {
        let msg = "Video upload failed";
        try {
          const errJson = JSON.parse(xhr.responseText);
          msg = errJson.error?.message || msg;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error uploading video"));
    xhr.ontimeout = () => reject(new Error("Video upload timed out"));
    xhr.send(formData);
  });
}

