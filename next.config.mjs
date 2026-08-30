/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // The COTI SDK and ethers are browser-safe, but their optional Node fallbacks confuse the
    // bundler; nothing here needs a polyfill.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false }
    return config
  },
}

export default nextConfig
