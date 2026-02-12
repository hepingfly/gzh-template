/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production'
const repository = process.env.GITHUB_REPOSITORY || ''
const repositoryName = repository.split('/')[1] || ''
const basePath = isProduction && repositoryName ? `/${repositoryName}` : ''

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  // Ensure external packages are handled correctly
  transpilePackages: ['mermaid', 'katex'],
  // Configure webpack if needed
  webpack: (config) => {
    // Handle mermaid.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
}

module.exports = nextConfig 
