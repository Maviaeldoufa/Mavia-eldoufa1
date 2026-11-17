import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.ts';

export const IS_VERCEL = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
);

export const UPLOADS_DIR = process.env.MVIA_UPLOADS_DIR
  ? path.resolve(process.env.MVIA_UPLOADS_DIR)
  : IS_VERCEL
  ? path.resolve('/tmp', 'mavia-runtime', 'uploads')
  : path.resolve(process.cwd(), 'uploads');

export function getStorageBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'mavia-uploads';
}

export function isSupabaseStorageEnabled(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (process.env.MVIA_FORCE_SUPABASE === '1') return true;
  if (process.env.MVIA_UPLOADS_DIR) return false;
  return true;
}

let bucketReadyPromise: Promise<void> | null = null;

async function ensureStorageBucket(): Promise<void> {
  if (bucketReadyPromise) return bucketReadyPromise;

  bucketReadyPromise = (async () => {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return;
    const bucket = getStorageBucketName();

    const { error: getErr } = await supabase.storage.getBucket(bucket);
    if (!getErr) return;

    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
    });
    if (
      createErr &&
      !createErr.message.toLowerCase().includes('already exists') &&
      !createErr.message.toLowerCase().includes('duplicate')
    ) {
      bucketReadyPromise = null;
      throw new Error(`Supabase Storage bucket error: ${createErr.message}`);
    }
  })();

  return bucketReadyPromise;
}

export function sanitizeUploadExtension(originalName?: string, fallback = '.bin'): string {
  const ext = path.extname(originalName || '').toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/i.test(ext)) return ext;
  return fallback;
}

export async function saveUploadedBuffer(params: {
  buffer: Buffer;
  originalName?: string;
  mimeType?: string;
  folderPrefix?: string;
  forcedFilename?: string;
}): Promise<{ fileUrl: string; filename: string }> {
  const ext = sanitizeUploadExtension(params.originalName);
  const baseFilename =
    params.forcedFilename ||
    `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

  if (isSupabaseStorageEnabled()) {
    const supabase = getSupabaseAdminClient()!;
    await ensureStorageBucket();
    const bucket = getStorageBucketName();
    const objectPath = params.folderPrefix
      ? `${params.folderPrefix.replace(/^\/+|\/+$/g, '')}/${baseFilename}`
      : baseFilename;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(objectPath, params.buffer, {
        contentType: params.mimeType || 'application/octet-stream',
        upsert: false,
      });

    if (uploadErr) {
      throw new Error(`فشل رفع الملف إلى Supabase Storage: ${uploadErr.message}`);
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(objectPath);
    return {
      fileUrl: pub.publicUrl,
      filename: baseFilename,
    };
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const destPath = path.join(UPLOADS_DIR, baseFilename);
  fs.writeFileSync(destPath, params.buffer);
  return {
    fileUrl: `/uploads/${baseFilename}`,
    filename: baseFilename,
  };
}

export async function removeStoredFile(fileUrl?: string): Promise<void> {
  if (!fileUrl) return;

  if (fileUrl.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore cleanup failure
      }
    }
    return;
  }

  const bucket = getStorageBucketName();
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = fileUrl.indexOf(marker);
  if (idx !== -1 && isSupabaseStorageEnabled()) {
    const objectPath = decodeURIComponent(fileUrl.slice(idx + marker.length).split('?')[0]);
    const supabase = getSupabaseAdminClient();
    if (supabase && objectPath) {
      await supabase.storage.from(bucket).remove([objectPath]).catch(() => {});
    }
  }
}

export async function readStoredFileBuffer(fileUrl?: string): Promise<Buffer | null> {
  if (!fileUrl) return null;

  if (fileUrl.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  }

  if (fileUrl.startsWith('/assets/')) {
    const candidates = [
      path.resolve(process.cwd(), 'public', fileUrl.slice(1)),
      path.resolve(process.cwd(), 'dist', fileUrl.slice(1)),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate);
      }
    }
    return null;
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    try {
      const res = await fetch(fileUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  return null;
}
