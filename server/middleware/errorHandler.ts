import type { NextFunction, Request, Response } from 'express';
import { logEvent, monitoringMetrics } from '../logger.ts';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly blocked?: boolean;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { blocked?: boolean; details?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.blocked = options?.blocked;
    this.details = options?.details;
  }
}

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  if (err instanceof ApiError) {
    if (err.statusCode === 401) monitoringMetrics.authFailures += 1;
    if (err.statusCode === 403) monitoringMetrics.authzDenials += 1;
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.blocked ? { blocked: true } : {}),
      ...(err.details !== undefined ? { details: err.details } : {}),
      requestId,
    });
    return;
  }

  const message =
    err instanceof Error ? err.message : 'An unexpected server error occurred.';
  logEvent('error', 'unhandled_api_error', {
    requestId,
    method: req.method,
    path: req.path,
    meta: { message },
  });

  res.status(500).json({
    error: 'Internal server error. Please try again shortly.',
    code: 'INTERNAL_SERVER_ERROR',
    requestId,
  });
}
