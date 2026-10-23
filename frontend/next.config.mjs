/** Static export: the Go server embeds `../web/app` and serves it behind its session check. */
const config = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  compiler: { styledComponents: true },
};

export default config;
