/**
 * Resolves static asset URLs (e.g. /seed-images/...) against Vite's BASE_URL so they
 * work both at root (/) and under a GitHub Pages subpath (/suk-link/).
 */
export function resolveAssetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }
  const base = import.meta.env.BASE_URL || '/';
  if (url.startsWith('/')) {
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    if (cleanBase && url.startsWith(cleanBase + '/')) {
      return url;
    }
    return `${cleanBase}${url}`;
  }
  return `${base.endsWith('/') ? base : `${base}/`}${url}`;
}

/**
 * Compresses an uploaded image file client-side to a maximum of 1024px WebP, under 200KB (Section 4 B).
 */
export async function compressImageToWebpDataUrl(
  file: File,
  maxDimension = 1024,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('IMAGE_READ_ERROR'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (typeof Image === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/webp', quality);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
