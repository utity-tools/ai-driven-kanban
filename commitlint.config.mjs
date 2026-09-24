/** @type {import("@commitlint/types").UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Keep subjects short enough to read in `git log --oneline` and PR titles.
    "header-max-length": [2, "always", 72],
  },
};

export default config;
