/**
 * Enhanced URL safety validation with SSRF protection
 * Provides robust validation against various attack vectors
 */

export interface UrlValidationResult {
	isValid: boolean;
	error?: string;
	details?: {
		protocol: string;
		hostname: string;
		isPrivateIp: boolean;
		isLocalhost: boolean;
		isReservedRange: boolean;
	};
}

export type UrlValidationOptions = {
	allowLocalhost?: boolean;
	allowPrivateIp?: boolean;
	allowReservedRange?: boolean;
	allowedHosts?: string[];
};

/**
 * Enhanced URL validator with comprehensive security checks
 */
export class UrlValidator {
	private readonly allowedSchemes = ["https", "http"];
	private readonly blockedPrivateRanges = [
		// IPv4 private ranges
		/^127\./, // 127.0.0.0/8
		/^10\./, // 10.0.0.0/8
		/^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
		/^192\.168\./, // 192.168.0.0/16
		/^169\.254\./, // 169.254.0.0/16 (link-local)

		// IPv6 private ranges
		/^::1$/, // IPv6 localhost
		/^fc00:/, // IPv6 unique local addresses
		/^fe80:/, // IPv6 link-local addresses
		/^fd00:/, // IPv6 unique local addresses (alternative)
	];

	private readonly localhostVariants = [
		"localhost",
		"localhost.localdomain",
		"127.0.0.1",
		"::1",
		"0.0.0.0",
		"[::1]",
	];

	private readonly dangerousSchemes = [
		"file",
		"ftp",
		"sftp",
		"ssh",
		"telnet",
		"gopher",
		"mailto",
		"sms",
		"tel",
	];

	/**
	 * Validate URL with comprehensive security checks
	 */
	validateUrl(urlString: string, options: UrlValidationOptions = {}): UrlValidationResult {
		try {
			// Basic URL parsing
			const trimmedUrl = urlString.trim();
			if (!trimmedUrl) {
				return { isValid: false, error: "Empty URL provided" };
			}

			const url = new URL(trimmedUrl);

			// Protocol validation
			const protocol = url.protocol.slice(0, -1); // Remove trailing colon
			if (!this.allowedSchemes.includes(protocol)) {
				return {
					isValid: false,
					error: `Protocol '${protocol}' not allowed. Allowed: ${this.allowedSchemes.join(", ")}`,
				};
			}

			// Check for dangerous schemes (double-check)
			if (this.dangerousSchemes.includes(protocol)) {
				return {
					isValid: false,
					error: `Dangerous protocol '${protocol}' blocked`,
				};
			}

			// Hostname validation
			const hostname = url.hostname.toLowerCase();
			if (!hostname) {
				return { isValid: false, error: "Missing hostname" };
			}

			const allowedHosts = (options.allowedHosts ?? [])
				.map((h) => (typeof h === "string" ? h.trim().toLowerCase() : ""))
				.filter(Boolean);
			const isAllowlistedHost =
				allowedHosts.length > 0 &&
				allowedHosts.some((allowed) => {
					if (allowed.startsWith(".")) {
						return hostname.endsWith(allowed);
					}
					return hostname === allowed;
				});

			// Check for localhost variants
			const isLocalhost = this.localhostVariants.includes(hostname);

			// Check for private IP ranges
			const isPrivateIp = this.isPrivateIp(hostname);

			// Check for reserved ranges
			const isReservedRange = this.isReservedRange(hostname);

			// Security validation
			if (isLocalhost && !options.allowLocalhost && !isAllowlistedHost) {
				return {
					isValid: false,
					error: "Localhost access not allowed",
					details: { protocol, hostname, isPrivateIp, isLocalhost, isReservedRange },
				};
			}

			if (isPrivateIp && !options.allowPrivateIp && !isAllowlistedHost) {
				return {
					isValid: false,
					error: "Private IP range access not allowed",
					details: { protocol, hostname, isPrivateIp, isLocalhost, isReservedRange },
				};
			}

			if (isReservedRange && !options.allowReservedRange && !isAllowlistedHost) {
				return {
					isValid: false,
					error: "Reserved IP range access not allowed",
					details: { protocol, hostname, isPrivateIp, isLocalhost, isReservedRange },
				};
			}

			// Port validation (block common dangerous ports)
			const port = url.port;
			if (port && this.isDangerousPort(port)) {
				return {
					isValid: false,
					error: `Port ${port} is not allowed`,
					details: { protocol, hostname, isPrivateIp, isLocalhost, isReservedRange },
				};
			}

			// Path validation (basic)
			if (url.pathname.includes("..")) {
				return {
					isValid: false,
					error: "Path traversal detected",
					details: { protocol, hostname, isPrivateIp, isLocalhost, isReservedRange },
				};
			}

			// All checks passed
			return {
				isValid: true,
				details: { protocol, hostname, isPrivateIp, isLocalhost, isReservedRange },
			};
		} catch (error) {
			return {
				isValid: false,
				error: `Invalid URL: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Check if hostname is a private IP address
	 */
	private isPrivateIp(hostname: string): boolean {
		// Check IPv4 private ranges
		for (const range of this.blockedPrivateRanges) {
			if (range.test(hostname)) {
				return true;
			}
		}

		// Check for IPv6 addresses that might be private
		if (hostname.includes(":")) {
			// Additional IPv6 checks
			const ipv6Private = [
				/^fc00:/, // Unique local addresses
				/^fe80:/, // Link-local addresses
				/^::1$/, // Localhost
			];

			for (const range of ipv6Private) {
				if (range.test(hostname)) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Check if hostname is a reserved range
	 */
	private isReservedRange(hostname: string): boolean {
		// Check for reserved/test IP ranges
		const reservedRanges = [
			/^192\.0\.2\./, // TEST-NET-1
			/^198\.51\.100\./, // TEST-NET-2
			/^203\.0\.113\./, // TEST-NET-3
			/^100\.64\./, // Shared address space (CGN)
			/^198\.18\./, // Benchmark testing
			/^240\.0\.0\./, // Reserved for future use
			/^255\.255\.255\.255/, // Broadcast
		];

		for (const range of reservedRanges) {
			if (range.test(hostname)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if hostname is an IP address (vs domain name)
	 */
	private isIpAddress(hostname: string): boolean {
		// Simple IP detection - more sophisticated than just checking for dots
		return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || /^[0-9a-fA-F:]+$/.test(hostname);
	}

	/**
	 * Check if port is dangerous/common administrative port
	 */
	private isDangerousPort(port: string): boolean {
		const portNum = parseInt(port, 10);
		if (isNaN(portNum)) return false;

		const dangerousPorts = [
			22, // SSH
			23, // Telnet
			25, // SMTP
			53, // DNS
			110, // POP3
			143, // IMAP
			443, // HTTPS (allowed but monitored)
			3306, // MySQL
			3389, // RDP
			5432, // PostgreSQL
			5984, // CouchDB
			6379, // Redis
			8080, // HTTP alternate
			8443, // HTTPS alternate
			9200, // Elasticsearch
			27017, // MongoDB
		];

		return dangerousPorts.includes(portNum);
	}
}

/**
 * Global URL validator instance
 */
const urlValidator = new UrlValidator();

/**
 * Enhanced URL validation function (drop-in replacement for isValidUrl)
 */
export function isValidUrlEnhanced(urlString: string): boolean {
	return urlValidator.validateUrl(urlString).isValid;
}

/**
 * Get detailed URL validation result
 */
export function validateUrlDetailed(
	urlString: string,
	options: UrlValidationOptions = {}
): UrlValidationResult {
	return urlValidator.validateUrl(urlString, options);
}

/**
 * Legacy compatibility - maintains original function signature
 */
export function isValidUrl(urlString: string): boolean {
	return isValidUrlEnhanced(urlString);
}
