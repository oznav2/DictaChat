# Security Policy

This document outlines the security protocols and vulnerability reporting guidelines for the **DictaChat** project. Ensuring the security of our systems is a top priority, and while we work diligently to maintain robust protection, vulnerabilities may still occur. We highly value the community’s role in identifying and reporting security concerns to uphold the integrity of our systems and safeguard our users.

## Supported Versions

We actively support and provide security updates for the following versions of **DictaChat**:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

We recommend always running the latest version from the `main` branch to ensure you have the most recent security patches and improvements.

## Reporting a Vulnerability

If you have identified a security vulnerability, please submit your findings via [GitHub Security Advisories](https://github.com/oznav2/DictaChat/security/advisories/new) or reach out to us on our [Discord Server](https://discord.gg/DictaChat).
Ensure your report includes all relevant information needed for us to reproduce and assess the issue. Include the context of your deployment (e.g., local Docker setup, GPU configuration) and the URL of the affected local service if applicable.

To ensure a responsible and effective disclosure process, please adhere to the following:

- Maintain confidentiality and refrain from publicly disclosing the vulnerability until we have had the opportunity to investigate and address the issue.
- Refrain from running automated vulnerability scans on our infrastructure or the gateway components without prior consent. Contact us to set up a sandbox environment if necessary.
- Do not exploit any discovered vulnerabilities for malicious purposes, such as accessing or altering user data stored in your local instances.
- Do not engage in physical security attacks, social engineering, distributed denial of service (DDoS) attacks, spam campaigns, or attacks on third-party applications integrated via MCP (Model Context Protocol) as part of your vulnerability testing.

## Out of Scope

While we appreciate all efforts to assist in improving our security, please note that the following types of vulnerabilities are considered out of scope:

- Vulnerabilities requiring man-in-the-middle (MITM) attacks or physical access to a user’s device or local server.
- Content spoofing or text injection issues without a clear attack vector or the ability to modify HTML/CSS in the Chat UI.
- Issues related to email spoofing (as the project primarily uses local gateway authentication).
- Missing DNSSEC, CAA, or CSP headers for local-only deployments.
- Absence of secure or HTTP-only flags on non-sensitive cookies used by the frontend interface.

## Our Commitment

At DictaChat, we are committed to maintaining transparent and collaborative communication throughout the vulnerability resolution process. Here's what you can expect from us:

- **Response Time**
  We will acknowledge receipt of your vulnerability report within three business days and provide an estimated timeline for resolution.
- **Legal Protection**
  We will not initiate legal action against you for reporting vulnerabilities, provided you adhere to the reporting guidelines.
- **Confidentiality**
  Your report will be treated with confidentiality. We will not disclose your personal information to third parties without your consent.
- **Recognition**
  With your permission, we are happy to publicly acknowledge your contribution to improving our security once the issue is resolved.
- **Timely Resolution**
  We are committed to working closely with you throughout the resolution process, providing timely updates as necessary. Our goal is to address all reported vulnerabilities swiftly, and we will actively engage with you to coordinate a responsible disclosure once the issue is fully resolved.

## Security Architecture & Features

**BricksLLM** is designed with a "Privacy First" architecture to maximize data sovereignty and security:

- **Local Execution**: The LLM (DictaLM-3.0) runs entirely on your local hardware using `llama-cpp`. No chat data is transmitted to external cloud providers for inference.
- **On-Premise Infrastructure**: All persistent data (chat history, settings, API keys) is managed within local Docker containers (PostgreSQL, Redis, MongoDB).
- **API Gateway Security**: BricksLLM acts as a secure gateway, requiring API keys for all proxy requests with support for PII (Personally Identifiable Information) scrubbing.
- **Tool Sandbox**: Tools executed via MCP are restricted to the environment you define, ensuring that model capabilities are safely contained.

We appreciate your help in ensuring the security of our platform. Your contributions are crucial to protecting our users and maintaining a secure environment. Thank you for working with us to keep DictaChat safe.

---

**Am Israel Chai! 🇮🇱**
