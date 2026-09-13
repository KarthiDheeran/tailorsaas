/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.TAILOR_PORTABLE_BUILD === "1" ? { output: "standalone" } : {}),
  // Keep automated verification separate from a developer's running server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
