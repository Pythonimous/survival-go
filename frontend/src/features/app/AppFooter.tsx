import { FEEDBACK_URL, GITHUB_REPO_URL } from "@/config/site";

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <p className="app-footer__note">
        AI inference runs in your browser on your device, not on the game server.
        If moves feel slow, try a smaller model or a GPU-capable browser — that is
        usually local hardware, not us :D
      </p>
      <p className="app-footer__note">
        Broken games, API errors, or anything clearly server-side? That is on us —{" "}
        <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
          send feedback
        </a>
        .
      </p>
      <nav className="app-footer__links" aria-label="Site links">
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
      </nav>
    </footer>
  );
}
