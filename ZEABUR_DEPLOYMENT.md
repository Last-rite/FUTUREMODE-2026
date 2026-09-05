# Zeabur Deployment Guide & Migration Roadmap

> **Target Platform Announcement**: The project will be deployed and hosted on **[Zeabur](https://zeabur.com)** for production releases. This document outlines the build specifications, environment variables, Google OAuth configuration, and deployment workflow required for deploying the **FUTUREMODE 2026** web client to Zeabur.

---

## 1. Project Specifications for Zeabur

The application is built with **Vite 6 + React + Tailwind CSS**, outputting optimized static assets.

| Parameter | Configuration |
|---|---|
| **Service Type** | Static Site / Web Service |
| **Node.js Runtime** | Node 18.x or 20.x LTS |
| **Package Manager** | `npm` (via `package-lock.json`) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **SPA Fallback** | Enabled (route all requests to `index.html`) |

---

## 2. Environment Variables Configuration

When setting up the project service on Zeabur, configure the following environment variables in the Zeabur Dashboard under **Service Settings → Environment Variables**:

| Variable Name | Description | Example / Current Value |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID for Google Identity Services | `1094286761155-pj1l6212km9g7249gu5a44bgs3a2q6rj.apps.googleusercontent.com` |

> [!IMPORTANT]
> **Google OAuth Origin Registration**:
> Whenever a new Zeabur domain is assigned (e.g., `https://futuremode-2026.zeabur.app` or a custom domain), you **must** add the exact origin to **Authorized JavaScript origins** in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
> - `https://<your-project-subdomain>.zeabur.app`
> - `http://localhost:5173` (for local development)

---

## 3. Zeabur Deployment Steps

### Option A: GitHub Git Integration (Recommended)
1. Log in to [Zeabur Console](https://dash.zeabur.com/).
2. Create a new Project or select an existing project.
3. Click **Add Service** → **Git** → Select repository `Last-rite/FUTUREMODE-2026`.
4. Zeabur will automatically detect the Vite project:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Under **Variables**, add `VITE_GOOGLE_CLIENT_ID`.
6. Click **Deploy**. Zeabur will automatically trigger CI/CD builds on every `git push` to branch `main`.
7. Under **Networking**, click **Generate Domain** to assign a free `.zeabur.app` domain or bind a custom domain with automatic SSL (HTTPS).

### Option B: Zeabur CLI (`zb`)
If deploying via command line:
```bash
npm install -g @zeabur/cli
zb login
zb deploy
```

---

## 4. SPA Routing & Server Headers

Vite builds a client-side Single Page Application. Zeabur automatically configures static file serving. If routing is extended to HTML5 History API paths, ensure static rewrite rules are set so 404 responses fallback to `/index.html`.

For Cross-Origin Isolation and smooth Canvas rendering, Zeabur provides automatic HTTP/2 and HTTPS edge termination with low-latency CDN caching.

---

## 5. Verification Checklist Before Going Live on Zeabur

- [x] Production build passes cleanly with zero errors (`npx vite build`).
- [ ] `VITE_GOOGLE_CLIENT_ID` configured in Zeabur project environment variables.
- [ ] Zeabur production URL added to Google Cloud Console Authorized JavaScript Origins.
- [ ] Google One-Tap / Sign-In and 1-day cookie storage verified on live HTTPS domain.
- [ ] Mobile touch controls and portrait viewport scaling verified on mobile devices.
