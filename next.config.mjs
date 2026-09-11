/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep automated verification separate from a developer's running server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
