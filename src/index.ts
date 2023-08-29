import { program } from "commander";

const cliName = "git-backup";

program
  .name(cliName)
  .description("Backup any file on your repo to a sqlite database");

program
  .command("setup")
  .description("Sets up the sqlite database")
  .action(async () => {
    const db = await getDb();

    db.prepare(
      `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      repo_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_content BLOB NOT NULL,

      UNIQUE (repo_name, file_name)
    );`
    ).run();

    console.log("Created database");
  });

program
  .argument("<filename>", "Files to backup")
  .action(async (filename: string) => {
    const { readFile } = await import("node:fs/promises");
    const crypto = await import("node:crypto");
    const githubUrl = await getGithubUrl();
    const db = await getDb();

    const fileContent = await readFile(filename);

    const res = db
      .prepare(
        `INSERT INTO files (id, repo_name, file_name, file_content) 
    VALUES (@id, @repoName, @fileName, @fileContent)
    RETURNING * ;`
      )
      .all({
        id: crypto.randomUUID(),
        repoName: githubUrl,
        fileName: filename,
        fileContent,
      } satisfies {
        id: string;
        repoName: string;
        fileName: string;
        fileContent: Buffer;
      }) as [FileRow];

    const row = res[0];

    console.log(`Stored file: ${filename}`);
  });

program.command("sync").action(async () => {
  const { writeFile } = await import("node:fs/promises");

  const db = await getDb();
  const githubUrl = await getGithubUrl();

  const res = db
    .prepare(
      `SELECT id, repo_name, file_name, file_content FROM files WHERE repo_name == @repoUrl;`
    )
    .all({ repoUrl: githubUrl } satisfies { repoUrl: string }) as FileRow[];

  await Promise.all(
    res.map(({ file_content, file_name }) => {
      return writeFile(file_name, file_content);
    })
  );

  console.log(`Created file: ${res.map((row) => row.file_name).join(",")}`);
});

program.parse();

async function getDb() {
  const { resolve } = await import("node:path");
  const appPaths = (await import("env-paths")).default(cliName);
  const makeDir = (await import("make-dir")).default;

  const dataDir = appPaths.data;
  await makeDir(dataDir);

  const db = (await import("better-sqlite3")).default(
    resolve(dataDir, "sqlite.db")
  );

  return db;
}

async function getGithubUrl() {
  const gitRemoteUrl = await (await import("git-remote-origin-url")).default();
  const parseGitUrlToGithub = (await import("github-url-from-git")).default;
  const githubUrl = parseGitUrlToGithub(gitRemoteUrl);

  return githubUrl;
}

type FileRow = {
  id: string;
  repo_name: string;
  file_name: string;
  file_content: Buffer;
};
