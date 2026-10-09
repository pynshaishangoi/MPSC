# MPSC Smart Study Hub V5 — GitHub Pages

## Publish this existing repository
1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select branch `main` and folder `/(root)`, then save.
5. Wait for GitHub Pages to finish building and open the URL shown on the Pages settings screen.

## Project files
- Keep `index.html`, `manifest.json`, and `sw.js` in the repository root.
- The app is a static front end and can run without a server database.
- Study progress and personal notes are stored in the user's browser; they are not automatically synchronized between devices.
- When changing the app, increment the cache name in `sw.js` so installed copies can fetch the new version.

## Content accuracy
- Use official MPSC final answer keys as the primary authority for answer validation.
- Distinguish verified previous-year questions from newly written practice questions.
- Check time-sensitive facts before labelling them current.
