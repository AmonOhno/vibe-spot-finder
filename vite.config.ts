import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content Security Policy（docs/SECURITY.md SR-10）。
 * ビルド成果物の index.html に meta で埋め込む。開発サーバーは HMR がインラインスクリプトと WebSocket を
 * 使うため対象外とする。`connect-src 'none'` で fetch / XHR / WebSocket による外部送信を遮断する（SR-01）。
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "connect-src 'none'",
  "font-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

/**
 * 配信時に付与するセキュリティヘッダー（SR-11）。`vite preview` で付与する。
 * 本番のホスティングでも同じヘッダーを設定すること。frame-ancestors は meta では効かないためヘッダーで渡す。
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': `${CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  preview: { headers: SECURITY_HEADERS },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
} as Parameters<typeof defineConfig>[0]);
