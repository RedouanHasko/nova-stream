<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5c854f34-b849-4e78-94ee-1d6d49cbee45

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Install backend dependencies:
   `npm run install:backend`
3. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
4. Run the frontend dev server:
   `npm run dev`
5. Run the backend server (in another terminal):
   `npm run backend:dev`

To run both frontend and backend together (concurrently):
```
npm run dev:all
```
