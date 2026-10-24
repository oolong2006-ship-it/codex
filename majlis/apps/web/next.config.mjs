const SERVER_EXTERNAL = [
  "@majlis/db",
  "@majlis/interviewer",
  "@majlis/dialect",
  "@majlis/providers",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Linting runs as its own CI step with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
  // These read data files next to their code (lexicons, phrases, migrations) and
  // must run from node_modules as-is, not bundled.
  serverExternalPackages: [
    "@majlis/db",
    "@majlis/interviewer",
    "@majlis/dialect",
    "@majlis/providers",
    "pg",
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      // Workspace packages are symlinked outside node_modules, so serverExternalPackages
      // alone does not cover them. Load them with a native import at runtime instead.
      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : [config.externals].filter(Boolean)),
        ({ request }, callback) =>
          request && SERVER_EXTERNAL.some((p) => request === p || request.startsWith(`${p}/`))
            ? callback(null, `import ${request}`)
            : callback(),
      ];
    }
    return config;
  },
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Voice-first: the camera is never requested; microphone only from our own origin.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
