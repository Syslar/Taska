/**
 * AppError — Custom error class with HTTP status code.
 * Thrown inside controllers/services; caught by the global error handler in app.ts.
 *
 * Usage:
 *   throw new AppError('Task not found', 404);
 *   throw new AppError('Forbidden', 403);
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Distinguishes expected errors from programming bugs

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
