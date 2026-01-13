# Next.js Production Template

This document provides step-by-step instructions to recreate this project architecture from scratch.

**Stack**: Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Supabase + Auth0

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [Directory Structure](#2-directory-structure)
3. [Design System](#3-design-system)
4. [Route Architecture](#4-route-architecture)
5. [SEO Configuration](#5-seo-configuration)
6. [Security Configuration](#6-security-configuration)
7. [Authentication](#7-authentication)
8. [Analytics](#8-analytics)
9. [Testing](#9-testing)
10. [CI/CD](#10-cicd)
11. [Quality Gates](#11-quality-gates)
12. [CDN and Caching Strategy](#12-cdn-and-caching-strategy)
13. [Image Optimization](#13-image-optimization)
14. [Compression and HTTP/3](#14-compression-and-http3)

---

## 1. Project Setup

### Step 1.1: Create Next.js Project

```bash
npx create-next-app@latest my-app --typescript --tailwind --eslint --app --src-dir=false
cd my-app
```

### Step 1.2: Install Dependencies

```bash
# Core dependencies
npm install @auth0/nextjs-auth0 @supabase/ssr @supabase/supabase-js jotai

# Analytics
npm install @microsoft/clarity @next/third-parties

# UI (optional)
npm install embla-carousel-react

# Dev dependencies
npm install -D @next/bundle-analyzer @playwright/test @testing-library/dom \
  @testing-library/jest-dom @testing-library/react @vitejs/plugin-react \
  eslint-config-prettier jsdom vitest
```

### Step 1.3: Configure package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:analyze": "ANALYZE=true next build",
    "start": "next start",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "NODE_OPTIONS='--max-old-space-size=4096' vitest",
    "test:run": "NODE_OPTIONS='--max-old-space-size=4096' vitest run",
    "test:coverage": "NODE_OPTIONS='--max-old-space-size=4096' vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 2. Directory Structure

### Step 2.1: Create Directory Structure

```bash
mkdir -p app/{(marketing),(app)/{auth,dashboard,diagnosis}}
mkdir -p components/{analytics,auth,layout,providers,seo,ui}
mkdir -p lib/{analytics,seo,supabase,navigation}
mkdir -p docs e2e public/.well-known
```

### Step 2.2: Final Structure

```
project-root/
├── app/
│   ├── (marketing)/          # Public pages (static/ISR, SEO-indexed)
│   │   ├── layout.tsx        # Static header, no auth
│   │   ├── page.tsx          # Landing page
│   │   ├── faq/
│   │   ├── privacy/
│   │   └── terms/
│   ├── (app)/                # App pages (dynamic, no-store)
│   │   ├── layout.tsx        # Auth provider, dynamic header
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── dashboard/
│   │   └── diagnosis/
│   ├── api/                  # API routes
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Design system
│   ├── robots.ts             # SEO: robots.txt
│   └── sitemap.ts            # SEO: sitemap.xml
├── components/
│   ├── analytics/            # GA4, Clarity
│   ├── auth/                 # Login/Logout buttons
│   ├── layout/               # Header, Footer, Breadcrumb
│   ├── providers/            # Jotai, Auth providers
│   ├── seo/                  # Structured data
│   └── ui/                   # Shared UI components
├── lib/
│   ├── analytics/            # gtag utilities, environment detection
│   ├── seo/                  # JSON-LD schema generators
│   ├── og/                   # OGP image generation
│   ├── supabase/             # Supabase clients
│   └── navigation/           # Breadcrumb utilities
├── docs/                     # Documentation
├── e2e/                      # Playwright E2E tests
├── public/
│   └── .well-known/          # security.txt
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
└── eslint.config.mjs
```

---

## 3. Design System

### Step 3.1: Configure Tailwind CSS v4

Create `app/globals.css`:

```css
@import 'tailwindcss';

/**
 * Color Palette - Apple HIG inspired (White, Black, Blue accent)
 * Contrast ratio: 4.5:1 minimum for text
 */
:root {
  /* Background colors */
  --background: #f9f9f9;
  --surface: #ffffff;

  /* Text colors */
  --text-primary: #111111;
  --text-secondary: #666666;

  /* Accent colors (Apple Blue) */
  --accent: #007aff;
  --accent-hover: #0056b3;

  /* Gold - for special highlights only */
  --gold: #e6b800;
  --gold-hover: #cc9f00;

  /* Divider colors */
  --divider: #e0e0e0;

  /* Dark section colors */
  --dark-bg: #111111;
  --dark-surface: #1e1e1e;
  --dark-text: #f1f1f1;
  --dark-text-secondary: #aaaaaa;
  --dark-divider: #333333;

  /* Legacy variables for compatibility */
  --foreground: var(--text-primary);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--text-primary);
  --color-surface: var(--surface);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-divider: var(--divider);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--text-primary);
  font-family:
    var(--font-sans),
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
}

/**
 * Utility classes for the design system
 */
.bg-surface {
  background-color: var(--surface);
}

.text-accent {
  color: var(--accent);
}

.text-secondary {
  color: var(--text-secondary);
}

.border-divider {
  border-color: var(--divider);
}

/**
 * Blue accent button styles (primary CTA)
 */
.btn-accent {
  background-color: var(--accent);
  color: #ffffff;
  transition: background-color 0.2s ease;
}

.btn-accent:hover {
  background-color: var(--accent-hover);
}

/**
 * Gold button styles (special highlights only)
 */
.btn-gold {
  background-color: var(--gold);
  color: #111111;
  transition: background-color 0.2s ease;
}

.btn-gold:hover {
  background-color: var(--gold-hover);
}

/**
 * Japanese Typography Optimization
 */
h1,
h2,
h3 {
  font-feature-settings: 'palt' 1; /* Proportional metrics for Japanese */
  word-break: auto-phrase; /* Natural line breaks (Chrome 119+) */
  line-height: 1.3; /* Optimal line height for Japanese */
}

h1 {
  letter-spacing: -0.02em; /* Tighten letter spacing for large headings */
}
```

### Step 3.2: Design Principles

| Principle  | Rule                                                             |
| ---------- | ---------------------------------------------------------------- |
| Colors     | Use CSS variables only (`var(--accent)`), never hardcode colors  |
| Fonts      | Use `next/font` for self-hosting, define in `--font-*` variables |
| Spacing    | Use Tailwind utilities (`p-4`, `m-2`, etc.)                      |
| Components | Server Components by default, `"use client"` only when necessary |

### Step 3.3: Component Pattern

```tsx
// components/ui/Button.tsx
interface ButtonProps {
  variant?: 'accent' | 'gold' | 'outline';
  children: React.ReactNode;
}

export function Button({ variant = 'accent', children }: ButtonProps) {
  const baseStyles = 'px-6 py-3 rounded-lg font-semibold transition-colors';
  const variantStyles = {
    accent: 'btn-accent',
    gold: 'btn-gold',
    outline: 'border-2 border-divider hover:bg-surface',
  };

  return <button className={`${baseStyles} ${variantStyles[variant]}`}>{children}</button>;
}
```

---

## 4. Route Architecture

### Step 4.1: Route Groups

| Group         | Path                           | Caching    | Auth | SEO |
| ------------- | ------------------------------ | ---------- | ---- | --- |
| `(marketing)` | `/`, `/faq`, `/privacy`        | Static/ISR | No   | Yes |
| `(app)`       | `/dashboard/*`, `/diagnosis/*` | no-store   | Yes  | No  |

### Step 4.2: Marketing Layout

Create `app/(marketing)/layout.tsx`:

```tsx
/**
 * Layout for marketing pages (Server Component).
 * Uses HeaderStatic to avoid client-side auth dependencies.
 * This keeps the landing page bundle size minimal.
 */
import HeaderStatic from '@/components/layout/HeaderStatic';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <HeaderStatic />
      {children}
    </div>
  );
}
```

### Step 4.3: App Layout (Authenticated)

Create `app/(app)/layout.tsx`:

```tsx
/**
 * Layout for app pages (authenticated area).
 * Auth0Provider is placed here to limit auth context to app routes only.
 * force-dynamic ensures user-specific pages are never cached (no-store policy).
 */
import type { Metadata } from 'next';
import Header from '@/components/layout/Header';
import { AppProviders } from '@/components/providers/AppProviders';

// Enforce dynamic rendering for all app pages (no-store policy)
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Dashboard',
    template: '%s',
  },
  robots: {
    index: false,
    follow: false,
    nosnippet: true,
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <div className="flex min-h-screen flex-col bg-[var(--background)]">
        <Header />
        {children}
      </div>
    </AppProviders>
  );
}
```

### Step 4.4: Root Layout

Create `app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { GoogleAnalytics } from '@next/third-parties/google';
import { ClarityProvider } from '@/components/analytics/ClarityProvider';
import { generateOrganizationSchema } from '@/lib/seo/schema';
import { isAnalyticsEnabledServer } from '@/lib/analytics/environment';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: {
    default: 'My App',
    template: '%s | My App',
  },
  description: 'App description',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'My App',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = generateOrganizationSchema();
  const analyticsEnabled = isAnalyticsEnabledServer();

  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Organization Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {children}
        {/* Analytics disabled in CI, test, and development environments */}
        {analyticsEnabled && <GoogleAnalytics gaId="G-XXXXXXXXXX" />}
        {analyticsEnabled && <ClarityProvider projectId="xxxxxxxxxx" />}
      </body>
    </html>
  );
}
```

---

## 5. SEO Configuration

### Step 5.1: robots.ts

Create `app/robots.ts`:

```tsx
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com';

  // Check if this is a preview/staging environment
  const isPreview =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NODE_ENV === 'development' ||
    baseUrl.includes('preview') ||
    baseUrl.includes('staging');

  if (isPreview) {
    // Disallow all indexing for preview/staging
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  // Production rules
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/api/', '/dashboard/', '/auth/', '/_next/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

### Step 5.2: sitemap.ts

Create `app/sitemap.ts`:

```tsx
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com';

  // Marketing pages (public, SEO-indexed)
  const marketingPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  return marketingPages;
}
```

### Step 5.3: Structured Data (JSON-LD)

Create `lib/seo/schema.ts`:

```tsx
type OrganizationSchema = {
  '@context': string;
  '@type': string;
  name: string;
  url: string;
  logo: string;
  description: string;
  contactPoint: {
    '@type': string;
    contactType: string;
    url: string;
  };
};

export function generateOrganizationSchema(): OrganizationSchema {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com';

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'My Organization',
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    description: 'Organization description',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: `${baseUrl}/contact`,
    },
  };
}

export type FAQItem = {
  question: string;
  answer: string;
};

export function generateFAQPageSchema(faqs: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
```

### Step 5.4: OGP Image Generation

Create `lib/og/OgImageTemplate.tsx`:

```tsx
import { ImageResponse } from 'next/og';

export const OG_SIZE = { width: 1200, height: 630 };

export interface OgImageProps {
  title: string;
  subtitle?: string;
  fontData: ArrayBuffer;
}

export function createOgImage(props: OgImageProps): ImageResponse {
  const { title, subtitle, fontData } = props;

  const titleFontSize = title.length > 20 ? 48 : title.length > 15 ? 52 : 56;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
        fontFamily: 'Noto Sans JP',
        position: 'relative',
      }}
    >
      {/* Logo (top-left) */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ color: '#ffffff', fontSize: 24, fontWeight: 600 }}>My App</span>
      </div>

      {/* Main content (centered - LINE safe zone) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          padding: '0 80px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            fontSize: titleFontSize,
            fontWeight: 700,
            color: '#ffffff',
            margin: 0,
            lineHeight: 1.3,
            maxWidth: 1000,
          }}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            style={{
              fontSize: 26,
              color: 'rgba(255,255,255,0.85)',
              margin: 0,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* URL (bottom-right) */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 60,
          display: 'flex',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20 }}>example.com</span>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        {
          name: 'Noto Sans JP',
          data: fontData,
          style: 'normal',
          weight: 700,
        },
      ],
    }
  );
}
```

Create `lib/og/fonts.ts`:

```tsx
/**
 * Load Noto Sans JP font for OGP image generation.
 */
export async function loadNotoSansJP(): Promise<ArrayBuffer> {
  const response = await fetch(
    'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.woff'
  );
  return response.arrayBuffer();
}
```

### Step 5.5: Page-specific OGP Image

Create `app/(marketing)/faq/opengraph-image.tsx`:

```tsx
import { createOgImage, OG_SIZE } from '@/lib/og/OgImageTemplate';
import { loadNotoSansJP } from '@/lib/og/fonts';

export const runtime = 'edge';
export const contentType = 'image/png';
export const size = OG_SIZE;
export const alt = 'FAQ - My App';

export default async function Image() {
  const fontData = await loadNotoSansJP();

  return createOgImage({
    title: 'FAQ',
    subtitle: 'Frequently Asked Questions',
    fontData,
  });
}
```

---

## 6. Security Configuration

### Step 6.1: Security Headers

Create `next.config.ts`:

```typescript
import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const securityHeaders = [
  {
    // Content Security Policy - Report Only mode for MVP
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  turbopack: {
    root: __dirname,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
```

### Step 6.2: ESLint Security Rules

Create `eslint.config.mjs`:

```javascript
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
  ]),
  {
    rules: {
      // Security: Prevent dangerous patterns
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Code quality
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
]);

export default eslintConfig;
```

---

## 7. Authentication

### Step 7.1: Auth0 Configuration

Create `lib/auth0.ts`:

```typescript
import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  authorizationParams: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email',
  },
});
```

### Step 7.2: App Providers

Create `components/providers/AppProviders.tsx`:

```tsx
'use client';

import { Auth0Provider } from '@auth0/nextjs-auth0/react';
import { Provider as JotaiProvider } from 'jotai';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <Auth0Provider>
      <JotaiProvider>{children}</JotaiProvider>
    </Auth0Provider>
  );
}
```

---

## 8. Analytics

### Step 8.1: Environment Detection

Create `lib/analytics/environment.ts`:

```typescript
/**
 * Check if running in a CI environment.
 */
function isCI(): boolean {
  return process.env.CI === 'true';
}

/**
 * Check if running in test environment.
 */
function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Check if running in development environment.
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running on localhost (client-side).
 */
function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Check if running in Playwright (client-side).
 */
function isAutomatedBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.webdriver === true;
}

/**
 * Client-side analytics check.
 */
export function isAnalyticsEnabled(): boolean {
  if (isCI()) return false;
  if (isTestEnv()) return false;

  if (typeof window !== 'undefined') {
    if (isLocalhost()) return false;
    if (isAutomatedBrowser()) return false;
  }

  return true;
}

/**
 * Server-side analytics check.
 */
export function isAnalyticsEnabledServer(): boolean {
  if (isCI()) return false;
  if (isTestEnv()) return false;
  if (isDevelopment()) return false;
  return true;
}
```

### Step 8.2: Clarity Provider

Create `components/analytics/ClarityProvider.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import Clarity from '@microsoft/clarity';
import { isAnalyticsEnabled } from '@/lib/analytics/environment';

export function ClarityProvider({ projectId }: { projectId: string }) {
  useEffect(() => {
    if (!projectId) return;

    if (!isAnalyticsEnabled()) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[Clarity] Disabled in this environment');
      }
      return;
    }

    const initClarity = () => {
      Clarity.init(projectId);
    };

    if ('requestIdleCallback' in window) {
      const idleCallbackId = window.requestIdleCallback(initClarity, {
        timeout: 3000,
      });
      return () => window.cancelIdleCallback(idleCallbackId);
    } else {
      const timeoutId = setTimeout(initClarity, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [projectId]);

  return null;
}
```

### Step 8.3: GA4 Tracking Utility

Create `lib/analytics/gtag.ts`:

```typescript
type EventParams = Record<string, string | number | boolean | undefined>;

export function track(event: string, params: EventParams = {}): void {
  if (typeof window === 'undefined') return;

  const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;

  if (!gtag) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Analytics] Event skipped (gtag not available):', event, params);
    }
    return;
  }

  gtag('event', event, params);
}

export const EVENTS = {
  VIEW_RESULT: 'view_result',
  CLICK_CTA: 'click_cta',
} as const;
```

---

## 9. Testing

### Step 9.1: Vitest Configuration

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 10000,
    include: ['app/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e', 'dist', 'build'],
    pool: 'threads',
    isolate: true,
    maxThreads: 4,
    minThreads: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', '.next', 'e2e', '**/*.config.*', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

Create `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
```

### Step 9.2: Playwright Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Step 9.3: Test File Pattern

```
app/(marketing)/__tests__/page.test.tsx     # Unit test for landing page
components/layout/__tests__/Header.test.tsx  # Unit test for component
lib/seo/__tests__/schema.test.ts            # Unit test for utility
e2e/landing-page.spec.ts                    # E2E test
```

### Step 9.4: Example Unit Test

Create `app/(marketing)/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from '../page';

describe('Landing Page', () => {
  it('should render the main heading', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('should have a CTA button', () => {
    render(<Page />);
    expect(screen.getByRole('link', { name: /get started/i })).toBeInTheDocument();
  });
});
```

### Step 9.5: Example E2E Test

Create `e2e/landing-page.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display the landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/My App/);
  });

  test('should have security headers', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers();

    expect(headers?.['x-content-type-options']).toBe('nosniff');
    expect(headers?.['x-frame-options']).toBe('DENY');
    expect(headers?.['strict-transport-security']).toContain('max-age=');
  });
});
```

---

## 10. CI/CD

### Step 10.1: GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Format check
        run: npm run format:check

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:run

  build:
    name: Build & Bundle Analysis
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          ANALYZE: 'true'

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Get Playwright version
        id: playwright-version
        run: echo "PLAYWRIGHT_VERSION=$(node -e "console.log(require('./package-lock.json').packages['node_modules/@playwright/test'].version)")" >> $GITHUB_ENV

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ env.PLAYWRIGHT_VERSION }}

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium

      - name: Install Playwright dependencies only
        if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium

      - name: Build
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

---

## 11. Quality Gates

### Step 11.1: Performance Budget

| Category               | Maximum Size |
| ---------------------- | ------------ |
| Initial JS (marketing) | 100KB (gzip) |
| Initial JS (app)       | 150KB (gzip) |
| Single image           | 200KB        |

### Step 11.2: Core Web Vitals Targets

| Metric | Target  |
| ------ | ------- |
| LCP    | ≤ 2.5s  |
| INP    | ≤ 200ms |
| CLS    | ≤ 0.1   |

### Step 11.3: Security Checklist

- [ ] CSP header configured
- [ ] HSTS enabled
- [ ] X-Frame-Options: DENY
- [ ] X-Content-Type-Options: nosniff
- [ ] No-store cache for user-specific pages
- [ ] noindex for authenticated pages

### Step 11.4: SEO Checklist

- [ ] robots.txt configured
- [ ] sitemap.xml generated
- [ ] Metadata API used for all pages
- [ ] OGP images (1200x630px)
- [ ] Structured data (JSON-LD)
- [ ] Preview environments = noindex

---

## 12. CDN and Caching Strategy

### Step 12.1: Cache-Control Headers

Understanding cache layers:

```
[Browser] ← Cache-Control → [CDN] ← CDN-Cache-Control → [Origin]
```

| Header              | Target        | Use Case                         |
| ------------------- | ------------- | -------------------------------- |
| `Cache-Control`     | Browser + CDN | General caching directives       |
| `CDN-Cache-Control` | CDN only      | CDN-specific settings (RFC 9213) |
| `Surrogate-Control` | CDN only      | Legacy CDN control               |

### Step 12.2: Caching Strategy by Route Type

```typescript
// next.config.ts - Add caching headers
const nextConfig: NextConfig = {
  async headers() {
    return [
      // Static assets - long cache
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Images - medium cache with revalidation
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      // Marketing pages - short cache with CDN override
      {
        source: '/((?!api|dashboard|auth).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, stale-while-revalidate=300',
          },
          {
            key: 'CDN-Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
    ];
  },
};
```

### Step 12.3: Vary Header for Content Negotiation

When serving different content based on request headers:

```typescript
// For image format negotiation (WebP/AVIF)
{
  key: 'Vary',
  value: 'Accept',
}

// For language negotiation
{
  key: 'Vary',
  value: 'Accept-Language',
}
```

### Step 12.4: Cache Invalidation Strategy

| Strategy               | When to Use                      |
| ---------------------- | -------------------------------- |
| Time-based (TTL)       | Content that changes on schedule |
| Versioned URLs         | Static assets (`/script.v1.js`)  |
| Cache tags/keys        | Content that needs instant purge |
| stale-while-revalidate | Balance freshness and speed      |

### Step 12.5: CDN Selection Considerations

| Factor             | Questions to Ask                   |
| ------------------ | ---------------------------------- |
| Edge locations     | Where are your users?              |
| Purge speed        | How fast can cache be invalidated? |
| Configuration      | How flexible is the CDN config?    |
| Image optimization | Built-in WebP/AVIF conversion?     |
| Pricing            | Per-request vs bandwidth-based?    |

---

## 13. Image Optimization

### Step 13.1: Image Size Budget

| Category   | Maximum Size | Action if Exceeded               |
| ---------- | ------------ | -------------------------------- |
| Thumbnail  | 50KB         | Reduce dimensions or quality     |
| Card image | 100KB        | Check format (use WebP/AVIF)     |
| Hero image | 200KB        | Consider responsive images       |
| Full-size  | 500KB        | **Must optimize** - unacceptable |

### Step 13.2: Image Format Selection

| Format | Use Case                                  | Browser Support         |
| ------ | ----------------------------------------- | ----------------------- |
| AVIF   | Best compression, modern browsers         | Chrome 85+, Firefox 93+ |
| WebP   | Good compression, wide support            | All modern browsers     |
| JPEG   | Fallback for legacy                       | Universal               |
| PNG    | Transparency required (avoid if possible) | Universal               |

**Decision tree:**

```
Is transparency needed?
├── Yes → WebP (with alpha) or AVIF
└── No → Is target audience modern browsers only?
    ├── Yes → AVIF with WebP fallback
    └── No → WebP with JPEG fallback
```

### Step 13.3: next/image Configuration

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    // Enable modern formats
    formats: ['image/avif', 'image/webp'],

    // Define allowed remote domains
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.example.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],

    // Define responsive breakpoints
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],

    // Minimize layout shift
    minimumCacheTTL: 60,
  },
};
```

### Step 13.4: Responsive Images with next/image

```tsx
import Image from 'next/image';

// Basic usage with automatic optimization
<Image
  src="/hero.jpg"
  alt="Hero image description"
  width={1200}
  height={630}
  priority // LCP candidate - preload
  quality={85}
/>

// Responsive with sizes hint
<Image
  src="/card.jpg"
  alt="Card image"
  fill
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  className="object-cover"
/>
```

### Step 13.5: Picture Element for Maximum Control

```tsx
/**
 * Use when you need:
 * - Different images for different screen sizes (art direction)
 * - Explicit format fallbacks
 * - CDN image transformation URLs
 */
function ResponsiveImage({ src, alt }: { src: string; alt: string }) {
  const baseUrl = 'https://cdn.example.com';

  return (
    <picture>
      {/* Large screens - AVIF */}
      <source
        media="(min-width: 1024px)"
        srcSet={`${baseUrl}${src}?w=1200&format=avif`}
        type="image/avif"
      />
      {/* Large screens - WebP fallback */}
      <source
        media="(min-width: 1024px)"
        srcSet={`${baseUrl}${src}?w=1200&format=webp`}
        type="image/webp"
      />
      {/* Medium screens - AVIF */}
      <source
        media="(min-width: 640px)"
        srcSet={`${baseUrl}${src}?w=800&format=avif`}
        type="image/avif"
      />
      {/* Medium screens - WebP fallback */}
      <source
        media="(min-width: 640px)"
        srcSet={`${baseUrl}${src}?w=800&format=webp`}
        type="image/webp"
      />
      {/* Small screens - WebP */}
      <source srcSet={`${baseUrl}${src}?w=400&format=webp`} type="image/webp" />
      {/* Ultimate fallback - JPEG */}
      <img src={`${baseUrl}${src}?w=400&format=jpeg`} alt={alt} loading="lazy" decoding="async" />
    </picture>
  );
}
```

### Step 13.6: Accept Header Based Format Selection

For CDN/server-side format negotiation:

```typescript
// middleware.ts or API route
function getOptimalImageFormat(acceptHeader: string): string {
  if (acceptHeader.includes('image/avif')) {
    return 'avif';
  }
  if (acceptHeader.includes('image/webp')) {
    return 'webp';
  }
  return 'jpeg';
}

// CDN configuration (e.g., Vercel, Cloudflare)
// Most CDNs handle this automatically with next/image
```

### Step 13.7: Image Optimization Checklist

- [ ] All images use `next/image` or `<picture>` element
- [ ] `priority` set on LCP candidate images
- [ ] `sizes` attribute properly configured
- [ ] AVIF/WebP formats enabled
- [ ] No image exceeds 500KB
- [ ] Lazy loading for below-fold images
- [ ] `alt` text on all images (accessibility)
- [ ] Proper `width`/`height` to prevent CLS

---

## 14. Compression and HTTP/3

### Step 14.1: Compression Algorithms

| Algorithm | Compression | Speed   | Use Case                           |
| --------- | ----------- | ------- | ---------------------------------- |
| Brotli    | Best        | Slower  | Static assets (CSS, JS)            |
| gzip      | Good        | Fast    | Dynamic content                    |
| None      | -           | Fastest | Already compressed (images, video) |

### Step 14.2: Brotli for Static Assets

Brotli provides ~15-25% better compression than gzip for text files.

```typescript
// Most CDNs and Vercel handle this automatically
// For custom nginx configuration:

// nginx.conf
// brotli on;
// brotli_comp_level 6;
// brotli_types text/plain text/css application/javascript application/json;
```

**Important notes:**

- Brotli compression is CPU-intensive at high levels
- Pre-compress static files at build time for best results
- Only use Brotli for cacheable content
- CDNs typically handle Brotli automatically

### Step 14.3: Next.js Compression

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  // Enable compression (default: true)
  compress: true,

  // For serverless, compression is typically handled by the platform
};
```

### Step 14.4: HTTP/3 Overview

```
HTTP/1.1 → TCP → Multiple connections needed
HTTP/2   → TCP → Single connection, but Head-of-Line blocking
HTTP/3   → QUIC (UDP) → No Head-of-Line blocking, faster on unstable networks
```

### Step 14.5: HTTP/3 Configuration

**For Vercel/Cloudflare:** HTTP/3 is enabled automatically.

**For custom servers:** Use `Alt-Svc` header to advertise HTTP/3:

```typescript
// Custom server configuration
{
  key: 'Alt-Svc',
  value: 'h3=":443"; ma=86400',
}
```

### Step 14.6: HTTPS Record (Future)

HTTPS DNS record enables:

- Direct HTTP/3 connection (skip HTTP/2 upgrade)
- Encrypted Client Hello (ECH) support
- Better security and performance

```
; DNS zone file (future standard)
example.com.  IN  HTTPS  1 . alpn="h3,h2" ipv4hint="1.2.3.4"
```

**Current status:** Limited DNS provider support. Monitor for wider adoption.

### Step 14.7: Performance Headers Summary

```typescript
// Comprehensive performance headers
const performanceHeaders = [
  // Caching
  { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
  { key: 'CDN-Cache-Control', value: 'public, max-age=86400' },

  // HTTP/3 advertisement
  { key: 'Alt-Svc', value: 'h3=":443"; ma=86400' },

  // Content negotiation
  { key: 'Vary', value: 'Accept, Accept-Encoding' },

  // Preload hints (for critical resources)
  { key: 'Link', value: '</fonts/inter.woff2>; rel=preload; as=font; crossorigin' },
];
```

---

## Quick Start Checklist

1. [ ] Create Next.js project
2. [ ] Install dependencies
3. [ ] Set up directory structure
4. [ ] Configure `globals.css` with design system
5. [ ] Create route group layouts (`(marketing)`, `(app)`)
6. [ ] Configure `next.config.ts` with security headers
7. [ ] Create `robots.ts` and `sitemap.ts`
8. [ ] Set up JSON-LD schema utilities
9. [ ] Configure analytics with environment detection
10. [ ] Set up Vitest and Playwright
11. [ ] Create GitHub Actions workflow
12. [ ] Run all tests and build

---

## Environment Variables

```bash
# App
NEXT_PUBLIC_BASE_URL=https://example.com

# Auth0
AUTH0_SECRET=
AUTH0_BASE_URL=
AUTH0_ISSUER_BASE_URL=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_AUDIENCE=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxxxxxxxxx
```

---

_Document Version: 1.0_
_Created: 2026-01-13_
