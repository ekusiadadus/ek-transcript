# EK Transcript - User Stories

## Mission

高速・高品質にユーザーインタビューを深掘りし、The Mom Test の原則に則って真の課題を発見する。

## The Mom Test Principles

| Principle | Anti-pattern | Correct Approach |
|-----------|--------------|------------------|
| Ask for facts | "Would you use this?" | "When did you last face this problem?" |
| Ask about past behavior | "What would you do?" | "What did you do?" |
| Avoid compliments | "Do you think this is good?" | "How much did you pay?" |
| Seek commitment | Satisfied with positive reactions | Will they risk time/money/reputation? |

## Target Users

| Persona | Goal |
|---------|------|
| Product Manager | Discover customer problems, prioritize |
| UX Researcher | Extract insights, find patterns |
| Customer Success | Understand customer truth, prevent churn |
| Business Development | Find market opportunities, validate PMF |
| Startup Founder | Validate hypotheses, pivot decisions |

---

## Epic 1: Interview Preparation

### US-1: Google Calendar Sync
**As a** user
**I want to** automatically fetch interview schedules from Google Calendar
**So that** I don't need to manually enter each interview

**Acceptance Criteria:**
- [ ] Connect Google account via OAuth
- [ ] Sync calendar events with "interview" keyword
- [ ] Display synced meetings in calendar view
- [ ] Show Google Meet link for each meeting

**Status:** ✅ Implemented

---

### US-2: Manual Meeting Creation
**As a** user
**I want to** manually create interview meetings
**So that** I can schedule interviews not in my calendar

**Acceptance Criteria:**
- [ ] Create meeting with title, description, start/end time
- [ ] Enable/disable auto-recording
- [ ] Enable/disable auto-transcription

**Status:** ✅ Implemented

---

### US-3: Auto-Recording Setup
**As a** user
**I want to** enable automatic recording for scheduled interviews
**So that** I don't forget to start recording

**Acceptance Criteria:**
- [ ] Toggle auto-recording for each meeting
- [ ] Show recording status badge
- [ ] Notify when recording starts

**Status:** ✅ Implemented

---

## Epic 2: Interview Recording & Upload

### US-4: Google Meet Recording Sync
**As a** user
**I want to** automatically fetch Google Meet recordings
**So that** recordings are available without manual download

**Acceptance Criteria:**
- [ ] Sync recordings from Google Drive
- [ ] Show recording list with status
- [ ] Link recordings to calendar events
- [ ] Display recording duration and timestamp

**Status:** ✅ Implemented

---

### US-5: Manual Video Upload
**As a** user
**I want to** manually upload video files
**So that** I can analyze recordings from other sources

**Acceptance Criteria:**
- [ ] Upload MP4, MOV, AVI, WebM formats
- [ ] Show upload progress
- [ ] Support files up to 3GB

**Status:** ✅ Implemented

---

### US-6: Batch Upload
**As a** user
**I want to** upload multiple videos at once
**So that** I can process many interviews efficiently

**Acceptance Criteria:**
- [ ] Drag & drop multiple files
- [ ] Upload up to 20 files at once
- [ ] Show individual and total progress
- [ ] Handle partial failures gracefully

**Status:** ✅ Implemented

---

## Epic 3: Analysis & Review

### US-7: Video-Transcript Sync
**As a** user
**I want to** view video and transcript synchronized
**So that** I can follow the conversation easily

**Acceptance Criteria:**
- [ ] Video player with playback controls
- [ ] Transcript auto-scrolls with video
- [ ] Current segment is highlighted
- [ ] Toggle sync on/off
- [ ] Speaker labels with distinct colors

**Status:** ⚠️ Partially Implemented (needs improvement)

**Improvement Plan:**
1. Create dedicated VideoPlayer component with ref controls
2. Connect VideoPlayer currentTime to TranscriptViewer
3. Add keyboard shortcuts (space: play/pause, arrow: seek)

---

### US-8: Timestamp Navigation
**As a** user
**I want to** click a transcript timestamp to jump to that point in video
**So that** I can quickly verify specific statements

**Acceptance Criteria:**
- [ ] Clickable timestamps on each segment
- [ ] Video seeks to clicked time
- [ ] Visual feedback on click
- [ ] Works in both directions (video→transcript, transcript→video)

**Status:** ⚠️ Partially Implemented (needs improvement)

**Improvement Plan:**
1. Add onTimestampClick callback to TranscriptViewer
2. Implement seekTo method in VideoPlayer
3. Add visual indicator for current playback position

---

### US-9: Analysis Results
**As a** user
**I want to** view structured analysis of the interview
**So that** I can understand key insights quickly

**Acceptance Criteria:**
- [ ] Summary section
- [ ] Key facts extracted (numbers, dates, names)
- [ ] Past actions documented
- [ ] Decision makers identified
- [ ] Evidence links to transcript

**Status:** ✅ Implemented (prompt to be updated for Mom Test)

---

## Epic 4: Management & Overview

### US-10: Interview List
**As a** user
**I want to** see all interviews in a list view
**So that** I can manage my interview library

**Acceptance Criteria:**
- [ ] List all interviews with key info
- [ ] Show status (pending, processing, completed, failed)
- [ ] Sort by date, status, score
- [ ] Quick actions (view, delete)

**Status:** ✅ Implemented

---

### US-11: Calendar View
**As a** user
**I want to** see interviews in a calendar format
**So that** I can visualize my interview schedule

**Acceptance Criteria:**
- [ ] Week view with hour slots
- [ ] Show scheduled, completed, and recorded meetings
- [ ] Click to view details
- [ ] Navigate between weeks

**Status:** ✅ Implemented

---

### US-12: Filtering & Search
**As a** user
**I want to** filter interviews by status
**So that** I can focus on specific interviews

**Acceptance Criteria:**
- [ ] Filter by status (all, scheduled, completed, analyzed)
- [ ] Search by title/description
- [ ] Clear filters easily

**Status:** ✅ Implemented

---

## Technical Requirements

### Architecture (TEMPLATE.md Compliance)

```
app/
├── (marketing)/           # Static/ISR, SEO-enabled
│   ├── page.tsx           # Landing page
│   ├── faq/page.tsx
│   ├── privacy/page.tsx
│   └── terms/page.tsx
│
├── (app)/                 # Dynamic, auth required, noindex
│   ├── layout.tsx         # Auth provider, header
│   ├── dashboard/page.tsx # Interview list & KPIs
│   ├── meetings/page.tsx  # Calendar & recordings
│   ├── upload/page.tsx    # Video upload
│   └── interview/[id]/
│       └── page.tsx       # Interview detail with video-transcript sync
│
├── api/
├── robots.ts
└── sitemap.ts
```

### Design System

- Apple HIG inspired colors
- Japanese typography optimized
- Contrast ratio ≥ 4.5:1
- CSS variables in globals.css
- Tailwind utility classes

### Security

- CSP headers
- HSTS
- X-Frame-Options
- Referrer-Policy

---

## Priority Matrix

| Priority | User Story | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | US-7: Video-Transcript Sync | Medium | High |
| P0 | US-8: Timestamp Navigation | Medium | High |
| P1 | Design System (globals.css) | Low | Medium |
| P1 | Route Groups (marketing/app) | Medium | Medium |
| P2 | Security Headers | Low | Low |
| P2 | SEO (robots, sitemap) | Low | Low |

---

## Epic 5: Interview Project Management

### US-13: Create Interview Project
**As a** user
**I want to** create an interview project before uploading videos
**So that** I can define the purpose and context of the interviews

**Acceptance Criteria:**
- [ ] Create project with title and description
- [ ] Define recruitment criteria (who was recruited)
- [ ] Define research questions (hypotheses to test)
- [ ] Define target persona (user attributes)
- [ ] Project status (ACTIVE, COMPLETED, ARCHIVED)

**Status:** 🚧 In Progress

---

### US-14: Project List View
**As a** user
**I want to** see all my interview projects in a list
**So that** I can manage and organize my research

**Acceptance Criteria:**
- [ ] Display project cards with title, description
- [ ] Show interview count per project
- [ ] Show project status badge
- [ ] Filter by status
- [ ] Click to view project details

**Status:** 🚧 In Progress

---

### US-15: Upload with Project Context
**As a** user
**I want to** select a project before uploading videos
**So that** uploaded interviews are properly categorized

**Acceptance Criteria:**
- [ ] Project selection required before upload
- [ ] Show selected project info on upload page
- [ ] Link uploaded videos to selected project
- [ ] Option to create new project from upload page

**Status:** 🚧 In Progress

---

### US-16: Project Dashboard
**As a** user
**I want to** view all interviews within a project
**So that** I can analyze patterns across related interviews

**Acceptance Criteria:**
- [ ] Project detail page with all interviews
- [ ] Aggregate statistics (total interviews, average score)
- [ ] Filter interviews within project
- [ ] View recruitment criteria and research questions

**Status:** 🚧 In Progress

---

## Next Steps

1. Create design system in globals.css
2. Implement route groups (marketing)/(app)
3. Improve VideoPlayer-TranscriptViewer sync
4. Update analysis prompt for Mom Test principles
