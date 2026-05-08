/** Safely extract a route param as string (Express 5 types params as string | string[]) */
export function param(req: { params: Record<string, unknown> }, name: string): string {
  const val = req.params[name];
  if (Array.isArray(val)) return val[0]!;
  return val as string;
}
