---
name: Bug report
about: Something isn't working as expected
title: 'bug: '
labels: bug
assignees: ''
---

## Describe the Bug

<!-- A clear and concise description of what the bug is. -->

## Reproduction

<!-- Minimal code snippet that reproduces the issue. -->

```ts
import { HTTPBuilder } from 'reixo';

const client = new HTTPBuilder('https://api.example.com').build();

// Your code here
```

## Expected Behaviour

<!-- What did you expect to happen? -->

## Actual Behaviour

<!-- What actually happened? Include any error messages or stack traces. -->

## Environment

| Field                     | Value                          |
| ------------------------- | ------------------------------ |
| reixo version             |                                |
| Node / Bun / Deno version |                                |
| Runtime                   | Node.js / Bun / Deno / Browser |
| OS                        | macOS / Windows / Linux        |
| TypeScript version        |                                |

## Additional Context

<!-- Logs, screenshots, or any other relevant information. -->
