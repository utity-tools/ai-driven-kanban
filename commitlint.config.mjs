/** @type {import("@commitlint/types").UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // 100 = conventional default; leaves room for Dependabot group titles.
    "header-max-length": [2, "always", 100],
    // Dependabot capitalises its subjects ("Bump x from…") and cannot be configured otherwise.
    "subject-case": [0],
  },
};

export default config;
