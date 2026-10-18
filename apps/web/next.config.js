//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Trace dependencies from the monorepo root so the standalone bundle includes them
  outputFileTracingRoot: require("path").join(__dirname, "../.."),
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js
};

module.exports = nextConfig;
