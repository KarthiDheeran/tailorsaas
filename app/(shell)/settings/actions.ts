"use server";

import { cookies } from "next/headers";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_TEXT_SIZE,
  DEFAULT_THEME,
  isAppTextSize,
  isDisplayTheme,
  TEXT_SIZE_COOKIE_NAME,
  THEME_COOKIE_NAME,
  type AppTextSize,
  type DisplayTheme,
} from "@/lib/theme";

export async function updateDisplayThemeAction(theme: DisplayTheme) {
  if (!isDisplayTheme(theme)) {
    return { success: false, error: "Invalid theme." };
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to update your theme." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ preferred_theme: theme })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: error.message || "Could not save theme." };
  }

  cookies().set(THEME_COOKIE_NAME, theme, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { success: true, theme: theme || DEFAULT_THEME };
}

export async function updateAppTextSizeAction(textSize: AppTextSize) {
  if (!isAppTextSize(textSize)) {
    return { success: false, error: "Invalid text size." };
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to update your text size." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ preferred_text_size: textSize })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: error.message || "Could not save text size." };
  }

  cookies().set(TEXT_SIZE_COOKIE_NAME, textSize, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { success: true, textSize: textSize || DEFAULT_TEXT_SIZE };
}
