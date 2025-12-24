/**
 * Comprehensive logging service with structured logging and correlation IDs
 */

import { randomUUID } from "crypto";

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

export interface LogEntry {
	timestamp: string;
	correlationId: string;
	level: LogLevel;
	levelName: string;
	message: string;
	metadata?: Record<string, unknown>;
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
}

export interface LoggingOptions {
	minLevel?: LogLevel;
	enableConsole?: boolean;
	enableFile?: boolean;
	filePath?: string;
	maxFileSize?: number;
	maxFiles?: number;
	redact?: boolean;
}

/**
 * Structured logging service with correlation ID support
 */
export class StructuredLoggingService {
	private correlationId: string;
	private options: Required<LoggingOptions>;

	constructor(correlationId?: string, options: LoggingOptions = {}) {
		this.correlationId = correlationId || randomUUID();
		this.options = {
			minLevel: options.minLevel ?? LogLevel.INFO,
			enableConsole: options.enableConsole ?? true,
			enableFile: options.enableFile ?? false,
			filePath: options.filePath ?? "/tmp/mcp.log",
			maxFileSize: options.maxFileSize ?? 10 * 1024 * 1024, // 10MB
			maxFiles: options.maxFiles ?? 5,
			redact: options.redact ?? true,
		};
	}

	/**
	 * Set correlation ID for this logger instance
	 */
	setCorrelationId(correlationId: string): void {
		this.correlationId = correlationId;
	}

	/**
	 * Get current correlation ID
	 */
	getCorrelationId(): string {
		return this.correlationId;
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.DEBUG, message, undefined, metadata);
	}

	/**
	 * Log an info message
	 */
	info(message: string, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.INFO, message, undefined, metadata);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.WARN, message, undefined, metadata);
	}

	/**
	 * Log an error message
	 */
	error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
		this.log(LogLevel.ERROR, message, error, metadata);
	}

	/**
	 * Core logging method
	 */
	private log(
		level: LogLevel,
		message: string,
		error?: Error,
		metadata?: Record<string, unknown>
	): void {
		// Check minimum log level
		if (level < this.options.minLevel) {
			return;
		}

		const logEntry: LogEntry = {
			timestamp: new Date().toISOString(),
			correlationId: this.correlationId,
			level,
			levelName: LogLevel[level],
			message,
			metadata,
			error: error
				? {
						name: error.name,
						message: error.message,
						stack: error.stack,
					}
				: undefined,
		};

		// Output to console if enabled
		if (this.options.enableConsole) {
			this.outputToConsole(logEntry);
		}

		// Output to file if enabled
		if (this.options.enableFile) {
			this.outputToFile(logEntry);
		}
	}

	/**
	 * Output log entry to console with appropriate formatting
	 */
	private outputToConsole(entry: LogEntry): void {
		const timestamp = new Date(entry.timestamp).toLocaleTimeString();
		const logMessage = `[${timestamp}] [${entry.correlationId}] [${entry.levelName}] ${entry.message}`;

		const safeMetadata = this.options.redact ? redactSensitiveData(entry.metadata) : entry.metadata;
		const safeError = this.options.redact ? redactSensitiveData(entry.error) : entry.error;

		// Use appropriate console method based on log level
		switch (entry.level) {
			case LogLevel.DEBUG:
				console.debug(logMessage, safeMetadata || "", safeError || "");
				break;
			case LogLevel.INFO:
				console.info(logMessage, safeMetadata || "", safeError || "");
				break;
			case LogLevel.WARN:
				console.warn(logMessage, safeMetadata || "", safeError || "");
				break;
			case LogLevel.ERROR:
				console.error(logMessage, safeMetadata || "", safeError || "");
				break;
		}
	}

	/**
	 * Output log entry to file (simplified implementation)
	 */
	private outputToFile(_entry: LogEntry): void {
		// For now, just log to console that file logging would happen
		// In a real implementation, this would write to a log file with rotation
		// const logLine = JSON.stringify(entry) + "\n";
		// console.log(`[FILE] ${logLine.trim()}`);
	}

	/**
	 * Create a child logger with the same correlation ID
	 */
	child(metadata: Record<string, unknown>): StructuredLoggingService {
		const childLogger = new StructuredLoggingService(this.correlationId, {
			minLevel: this.options.minLevel,
			enableConsole: this.options.enableConsole,
			enableFile: this.options.enableFile,
			redact: this.options.redact,
		});

		// Add child-specific metadata to all logs
		const originalLog = childLogger.log.bind(childLogger);
		childLogger.log = (
			level: LogLevel,
			message: string,
			error?: Error,
			extraMetadata?: Record<string, unknown>
		) => {
			const combinedMetadata = { ...metadata, ...extraMetadata };
			originalLog(level, message, error, combinedMetadata);
		};

		return childLogger;
	}
}

/**
 * Global logging service instance
 */
let globalLogger: StructuredLoggingService | null = null;

/**
 * Initialize the global logging service
 */
export function initializeLogging(
	correlationId?: string,
	options?: LoggingOptions
): StructuredLoggingService {
	globalLogger = new StructuredLoggingService(correlationId, options);
	return globalLogger;
}

/**
 * Get the global logging service
 */
export function getLogger(): StructuredLoggingService {
	if (!globalLogger) {
		globalLogger = new StructuredLoggingService();
	}
	return globalLogger;
}

/**
 * Convenience functions for global logger
 */
export function logDebug(message: string, metadata?: Record<string, unknown>): void {
	getLogger().debug(message, metadata);
}

export function logInfo(message: string, metadata?: Record<string, unknown>): void {
	getLogger().info(message, metadata);
}

export function logWarn(message: string, metadata?: Record<string, unknown>): void {
	getLogger().warn(message, metadata);
}

export function logError(message: string, error?: Error, metadata?: Record<string, unknown>): void {
	getLogger().error(message, error, metadata);
}

/**
 * Redact sensitive data from logs
 */
function redactSensitiveData(data: unknown): unknown {
	if (!data) return data;

	// Handle strings directly
	if (typeof data === "string") {
		// Redact Bearer tokens
		if (data.includes("Bearer ")) {
			return data.replace(/Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, "Bearer [REDACTED]");
		}
		// Redact generic API keys (sk-...)
		if (/(sk-[a-zA-Z0-9]{20,})/.test(data)) {
			return data.replace(/(sk-[a-zA-Z0-9]{20,})/g, "[REDACTED]");
		}
		return data;
	}

	// Handle arrays
	if (Array.isArray(data)) {
		return data.map(redactSensitiveData);
	}

	// Handle objects
	if (typeof data === "object") {
		// Handle Error objects specifically if passed as generic object
		if (data instanceof Error) {
			return {
				name: data.name,
				message: redactSensitiveData(data.message),
				stack: redactSensitiveData(data.stack),
			};
		}

		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			// Check for sensitive keys
			// "keyId" is usually safe and useful for debugging.
			if (
				/password|token|secret|key|auth|credential|cookie/i.test(key) &&
				!key.toLowerCase().includes("keyid")
			) {
				result[key] = "[REDACTED]";
			} else {
				result[key] = redactSensitiveData(value);
			}
		}
		return result;
	}

	return data;
}
