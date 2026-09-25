import { signInWithGitHub } from "@/app/(auth)/actions";
import { GitHubIcon } from "@/components/icons/github-icon";

import { PendingSubmitButton } from "./pending-submit-button";

export function GitHubSignInForm({ next }: { next: string }) {
  return (
    <form action={signInWithGitHub}>
      <input type="hidden" name="next" value={next} />
      <PendingSubmitButton
        variant="outline"
        size="lg"
        className="w-full"
        pendingLabel="Redirecting to GitHub…"
      >
        <GitHubIcon />
        Continue with GitHub
      </PendingSubmitButton>
    </form>
  );
}
