export interface ReleaseInfo {
    tag_name: string;
    name: string;
    published_at: string;
    html_url: string; // takes you to the release summary page on github
    // public assets: string[] = [];
}

export async function getLatestRelease(owner: string, repo: string): Promise<ReleaseInfo> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    {
      headers: {
        "Accept": "application/vnd.github+json",
        "User-Agent": "thermo-logger", // required by GitHub
      },
    }
  );

  if ( ! res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}
