# FinSentry AI — Invoice Risk Intelligence

**Turning invoice data into clearer financial decisions.**

FinSentry AI is a web-based invoice risk intelligence and financial decision-support application designed to help businesses review invoices, understand payment risks, monitor liquidity, and organize approval decisions.

Instead of treating every invoice equally, FinSentry aims to help finance teams identify invoices that may need attention, understand the reasons behind a risk assessment, and evaluate how payment decisions could affect available cash.

## Overview

Businesses must manage incoming invoices while balancing supplier payments, available cash, upcoming obligations, and minimum operating reserves. Making payment decisions without considering these factors can create unnecessary financial pressure.

FinSentry AI brings invoice review and basic financial planning into one interface. It provides invoice management, approval case tracking, financial configuration, and liquidity impact analysis.

## Key Features

### 1. Invoice Risk Intelligence
- Add and review invoice information.
- Organize invoice records for financial review.
- Support invoice risk assessment and prioritization.
- Present decision-support information to assist human reviewers.

### 2. Financial Dashboard
- Access the application's main financial overview.
- Navigate between invoice management, approval cases, and financial settings.
- Provide a centralized interface for invoice-related workflows.

### 3. Approval Cases
- Review invoice cases that require attention.
- Organize approval-related decisions.
- Support a more structured invoice review process.

### 4. Financial Settings
Configure financial values used in liquidity analysis:

- **Current Available Cash:** Cash currently available to the business.
- **Minimum Operating Reserve:** The minimum cash balance the business aims to preserve.
- **Upcoming Obligations / Payments:** Additional payments expected in the near future.

These values provide context for evaluating whether a potential payment could create liquidity pressure.

### 5. “What If I Pay?” Simulation
The application is designed to support payment scenario analysis.

For example, a finance reviewer can evaluate a proposed invoice payment against available cash, upcoming obligations, and the required operating reserve.

This helps frame an important question: *Can the business make this payment while maintaining sufficient operating liquidity?*

The usefulness of the result depends on the accuracy and completeness of the configured financial data.

### 6. Explainable Decision Support
FinSentry is designed to provide understandable reasoning alongside its assessments instead of presenting a decision without context.

The current configuration uses deterministic explanations when an AI provider is not configured. Live AI-generated reasoning should not be assumed to be active.

### 7. Financial Decision Support, Not Automatic Approval
FinSentry is intended to assist finance teams. It does not replace human judgment, guarantee fraud detection, or independently guarantee that a payment is safe.

## Technology Stack

The project uses the following technologies visible in its current structure:

- **HTML** — Web page structure.
- **CSS** — Application styling and layout.
- **JavaScript** — Frontend behavior and application logic.
- **Node.js** — Server-side JavaScript runtime.
- **npm** — Package management and project scripts.
- **JSON** — Structured data storage and exchange.

The frontend files are located in `public/`, while the server entry point is `server/index.js`.

Additional libraries and services can be identified from `package.json` and the application's implementation.

## Project Structure

```text
finsentry-ai/
│
├── data/
│   └── finsentry-data.json
│
├── public/
│   ├── app.js
│   ├── index.html
│   └── style.css
│
├── server/
│   └── index.js
│
├── package.json
├── package-lock.json
└── README.md
```

### Folder and File Responsibilities

| File or folder | Purpose |
|---|---|
| `public/index.html` | Defines the web application's page structure. |
| `public/style.css` | Contains the application's visual styling. |
| `public/app.js` | Implements client-side interactions and application behavior. |
| `server/index.js` | Starts the Node.js server and handles the server-side application. |
| `data/finsentry-data.json` | Holds application data if the current implementation uses this JSON file for persistence. |
| `package.json` | Defines project metadata, scripts, and dependencies. |
| `package-lock.json` | Records the resolved npm dependency versions. |

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm.
- Git.
- A GitHub account.

### 1. Clone the Repository

```bash
git clone https://github.com/Chitrashree-G13/Finsentry-AI.git
```

Replace `Chitrashree-G13` with your GitHub username.

### 2. Enter the Project Directory

```bash
cd finsentry-ai
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Application

```bash
npm start
```

### 5. Open the Application

Visit:

http://localhost:3000

The server must remain running in the terminal while you use the application locally.

If the application fails to load, check the terminal for startup errors and verify that port `3000` is available.

## Example Financial Scenario

Consider a hypothetical business with these financial settings:

| Financial input | Example amount |
|---|---:|
| Current available cash | ₹12,00,000 |
| Minimum operating reserve | ₹50,00,000 |
| Upcoming obligations | ₹6,00,000 |

These are illustrative figures, not actual business financial data.

The example shows why an invoice should not be evaluated solely on its invoice amount. The finance team should also consider available liquidity, expected payments, and the minimum cash reserve.

In this example, the available cash is already below the configured operating reserve. That is a reason to review the financial situation carefully, not proof that any particular invoice is fraudulent or must automatically be rejected.

## Current AI Configuration

FinSentry can use deterministic reasoning when no external AI provider is configured.

In the current local setup, the server reports:

`AI provider configured: no (using deterministic explanations)`

This means the application can use programmed rules and explanations without relying on a configured live AI model.

An external AI integration should be described as an active feature only after its configuration and actual operation have been verified.

## Security and Data Handling

Financial applications may process confidential information. Important considerations include:

- Never commit API keys, credentials, or private environment files to GitHub.
- Do not publish real invoices, customer records, or confidential financial information.
- Use synthetic data for public demonstrations.
- Validate user inputs on the server as well as the client where appropriate.
- Configure authentication and authorization before exposing sensitive financial operations publicly.
- Use appropriate access controls and secure storage for production deployments.

The presence of a local application or JSON data file does not, by itself, establish production-grade security or database durability.

## Limitations

FinSentry is a decision-support project, and its capabilities depend on the current implementation and configuration.

- Risk assessments depend on the available invoice data and implemented rules.
- Liquidity simulations depend on the configured financial inputs.
- Live AI functionality requires a working AI provider integration.
- Fraud detection accuracy has not been established merely by building the application.
- Production use would require additional validation, security controls, and testing.

## Future Improvements

Potential areas for future development include:

- Integration with a secure relational database.
- Invoice document extraction and automated field validation.
- Historical invoice and payment trend analysis.
- Supplier payment behavior analysis.
- Configurable risk indicators and explainable scoring.
- More detailed liquidity forecasting.
- Role-based access control and approval audit trails.
- Optional integration with an AI provider for additional explanations.
- Automated testing and deployment.

These are possible extensions, not claims that all of them are already implemented.

## Project Goal

The goal of FinSentry AI is to make invoice review more structured and financial decisions more transparent by connecting invoice information with risk assessment and liquidity considerations.

The project explores how a practical web application can support finance teams in prioritizing reviews, understanding potential concerns, and making better-informed payment decisions.

## Disclaimer

FinSentry AI is an educational and decision-support project. Its outputs are not financial, accounting, legal, or fraud-detection guarantees. All payment and approval decisions should be verified by authorized human reviewers.

## Author

**Chitrashree G**

Computer Science and Design  
Atria Institute of Technology, Bengaluru

GitHub: [Chitrashree-G13](https://github.com/Chitrashree-G13)

---

*Built as a project exploring invoice risk intelligence, explainable decision support, and financial liquidity analysis.*
