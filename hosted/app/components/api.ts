export async function readAPI(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The service response could not be verified. Please try again.");
  return value as Record<string, unknown>;
}
export function apiMessage(value: Record<string, unknown>, fallback: string): string {
  const error = value.error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message.slice(0, 1000);
  return fallback;
}
