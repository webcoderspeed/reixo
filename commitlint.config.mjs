/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow these types in reixo commits
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation
        'style', // Formatting, no logic change
        'refactor', // Refactoring
        'perf', // Performance improvement
        'test', // Adding or updating tests
        'build', // Build system, dependencies
        'ci', // CI/CD changes
        'chore', // Maintenance
        'revert', // Revert a commit
        'security', // Security improvements
      ],
    ],
    // Subject must not be empty and max 100 chars
    'subject-max-length': [2, 'always', 100],
    // Body must have blank line before
    'body-leading-blank': [2, 'always'],
    // Footer must have blank line before
    'footer-leading-blank': [1, 'always'],
  },
};

export default config;
