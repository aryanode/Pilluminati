import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  uid?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 120;
const recentLogs: LogEntry[] = [];

export const monitoringMetrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  totalErrors: 0,
  authFailures: 0,
  authzDenials: 0,
  schedulerTicks: 0,
  alertsDispatched: 0,
  geminiCalls: 0,
  geminiFailures: 0,
};

export function logEvent(
  level: LogLevel,
  event: string,
  details: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'event'> = {},
): LogEntry {
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  recentLogs.unshift(entry);
  if (recentLogs.length > MAX_LOG_ENTRIES) {
    recentLogs.length = MAX_LOG_ENTRIES;
  }

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
  return entry;
}

export function getRecentLogs(limit = 40): LogEntry[] {
  return recentLogs.slice(0, Math.min(limit, MAX_LOG_ENTRIES));
}

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  const requestId = crypto.randomBytes(6).toString('hex');
  const start = Date.now();
  monitoringMetrics.totalRequests += 1;
  res.setHeader('X-Request-Id', requestId);
  (req as Request & { requestId?: string }).requestId = requestId;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    if (statusCode >= 500) {
      monitoringMetrics.totalErrors += 1;
    }
    const level: LogLevel =
      statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    logEvent(level, 'api_request', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      durationMs,
    });
  });

  next();
}
