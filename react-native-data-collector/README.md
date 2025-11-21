# React Native Data Collector App

This app allows data collectors to log in, download forms for their facility, fill forms offline, sync data to the server, edit/delete entries, update quality improvement follow-up, and receive notifications from the server.

## Features
- Login with backend authentication
- Download forms for user's facility (facility.category == program.category)
- Offline-first: fill, edit, delete forms offline
- Sync entries to server when online
- Edit/post-update quality_improvement_followup after viewing reviewers_comment
- Notifications (title, recipients, body)

## Setup
1. Install dependencies: `npm install`
2. Run on Android: `npx react-native run-android`
3. Run on iOS: `npx react-native run-ios`

## Folder Structure
- `/src` - App source code
- `/src/screens` - Screens (Login, Home, Form, Sync, Notifications)
- `/src/components` - Reusable components
- `/src/services` - API, storage, sync logic
- `/src/models` - Data models

## API Endpoints
- `/api/auth/login` (POST)
- `/api/facilities/:id/forms` (GET)
- `/api/activity/:activityId/submissions` (POST)
- `/api/answers/:id/followup` (PATCH)
- `/api/notifications` (GET)

## Notes
- Uses AsyncStorage for offline data
- Replace API URLs with your backend endpoints
- Push notifications require server and device setup

---
