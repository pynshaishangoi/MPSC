# MPSC Smart Study Hub V4 — GitHub Pages

## Upload
1. Sign in to GitHub.
2. Create a **Public** repository. For a personal site, name it `<your-github-username>.github.io`.
3. Open the repository → **Add file** → **Upload files**.
4. Upload everything inside this V4 folder (do not upload the outer ZIP itself).
5. Commit the files to the `main` branch.

## Publish
1. Repository → **Settings** → **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Branch: `main`; folder: `/ (root)`.
4. Save.
5. Wait a few minutes and open the GitHub Pages URL shown by GitHub.

## Important
- `index.html` must remain in the repository root.
- Keep `manifest.json` and `sw.js` in the root.
- The app works as a normal website even if PWA installation is unavailable.
- V4 stores progress in the browser using localStorage.
- V4 is a static front end; it does not yet have cloud accounts or a server database.
