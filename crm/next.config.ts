import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Empacota o servidor só com os módulos que ele usa, resolvidos na
   * compilação. É o que deixa a imagem final sem o `node_modules` inteiro —
   * ver Dockerfile.
   */
  output: "standalone",
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:caminho*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
