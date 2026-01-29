export function generateCurlCommand(
  url: string,
  method: string = 'GET',
  headers: Record<string, string> | Headers = {},
  body?: unknown
): string {
  let command = `curl -X ${method.toUpperCase()} '${url}'`;

  // Handle Headers
  const headerEntries: [string, string][] = [];
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      headerEntries.push([key, value]);
    });
  } else {
    Object.entries(headers).forEach(([key, value]) => {
      headerEntries.push([key, value]);
    });
  }

  headerEntries.forEach(([key, value]) => {
    command += ` \\\n  -H '${key}: ${value}'`;
  });

  // Handle Body
  if (body) {
    if (typeof body === 'string') {
      command += ` \\\n  -d '${escapeSingleQuotes(body)}'`;
    } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
      // FormData usually implies multipart/form-data.
      // curl uses -F for form data.
      // We iterate over the entries if possible.
      // Note: FormData iteration is available in modern browsers and Node.js 18+
      try {
        for (const [key, value] of body.entries()) {
          if (typeof value === 'string') {
            command += ` \\\n  -F '${key}=${escapeSingleQuotes(value)}'`;
          } else if (
            (typeof File !== 'undefined' && value instanceof File) ||
            (typeof Blob !== 'undefined' && value instanceof Blob)
          ) {
            // For files, we can't really reconstruct the file path from a Blob/File object in browser context.
            // We can just show a placeholder or [File content]
            command += ` \\\n  -F '${key}=@file'`;
          }
        }
      } catch {
        // Fallback if iteration is not supported
        command += ` \\\n  --data-binary '[FormData]'`;
      }
    } else if (body instanceof URLSearchParams) {
      command += ` \\\n  -d '${escapeSingleQuotes(body.toString())}'`;
    } else if (typeof body === 'object') {
      try {
        const jsonBody = JSON.stringify(body);
        command += ` \\\n  -d '${escapeSingleQuotes(jsonBody)}'`;

        // Ensure Content-Type is set to application/json if not already present
        const hasContentType = headerEntries.some(([key]) => key.toLowerCase() === 'content-type');
        if (!hasContentType) {
          command += ` \\\n  -H 'Content-Type: application/json'`;
        }
      } catch {
        // If serialization fails, ignore
      }
    }
  }

  return command;
}

function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, "'\\''");
}
