/**
 * Safely constructs a full API URL from a base URL and a path.
 * This prevents issues with leading/trailing slashes.
 * @param baseUrl The base URL of the API (e.g., http://localhost:8000).
 * @param path The path for the endpoint (e.g., /api/data).
 * @returns The fully constructed, valid URL as a string.
 */
export const createApiUrl = (baseUrl: string, path: string): string => {
  try {
    // The URL constructor is the most robust way to handle joining paths.
    // It correctly handles cases where baseUrl has or doesn't have a trailing slash,
    // and where the path has or doesn't have a leading slash.
    return new URL(path, baseUrl).toString();
  } catch (error) {
    console.error(`Error creating API URL with baseUrl: "${baseUrl}" and path: "${path}"`, error);
    // Fallback for safety, in case the user provides a completely invalid baseUrl.
    const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
    return `${trimmedBase}/${trimmedPath}`;
  }
};