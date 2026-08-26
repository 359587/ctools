export class AppError extends Error {
  constructor(
    message: string,
    readonly code = 'APP_ERROR',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
