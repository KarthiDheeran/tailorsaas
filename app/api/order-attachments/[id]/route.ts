import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireServerPermission } from "@/lib/auth/require-server-permission";
import {
  getOrderAttachmentById,
  ORDER_ATTACHMENTS_BUCKET,
} from "@/lib/data/order-attachments-db";
import {
  DEFAULT_SHOP_BILLING_SETTINGS,
  getShopBillingSettings,
} from "@/lib/data/shop-billing-settings-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function resolveLocalAttachmentPath(rootPath: string, relativePath: string) {
  const root = path.resolve(rootPath.trim());
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Attachment path is outside the configured storage folder.");
  }
  return resolved;
}

function contentDispositionFileName(fileName: string) {
  return fileName.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "attachment";
}

async function localAttachmentExists(rootPath: string | undefined, relativePath: string) {
  if (!rootPath?.trim()) return false;
  try {
    await fs.access(resolveLocalAttachmentPath(rootPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const guard = await requireServerPermission(supabase, "orders.view");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: 403 });
  }

  const admin = createAdminClient();
  const attachment = await getOrderAttachmentById(admin, params.id);
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const settings = await getShopBillingSettings(admin).catch(
    () => DEFAULT_SHOP_BILLING_SETTINGS
  );
  const shouldUseLocal =
    attachment.storageProvider === "local" ||
    (settings.attachmentStorageProvider === "local" &&
      (await localAttachmentExists(
        settings.attachmentLocalRootPath,
        attachment.storagePath
      )));

  if (!shouldUseLocal) {
    const { data, error } = await admin.storage
      .from(ORDER_ATTACHMENTS_BUCKET)
      .createSignedUrl(attachment.storagePath, 60 * 60);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? "Attachment file is not available." },
        { status: 404 }
      );
    }
    return NextResponse.redirect(data.signedUrl);
  }

  if (!settings.attachmentLocalRootPath?.trim()) {
    return NextResponse.json(
      { error: "Local attachment folder is not configured." },
      { status: 409 }
    );
  }

  try {
    const filePath = resolveLocalAttachmentPath(
      settings.attachmentLocalRootPath,
      attachment.storagePath
    );
    const bytes = await fs.readFile(filePath);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${contentDispositionFileName(
          attachment.fileName
        )}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Attachment file is not available.",
      },
      { status: 404 }
    );
  }
}
