# Pulse Analytics

**Business Performance Analytics Dashboard**

Pulse Analytics is a production-oriented web application for analyzing business performance data from CSV files. Users can upload structured business data, calculate KPIs, compare performance between periods, visualize trends, and generate deterministic performance insights.

The application combines a vanilla JavaScript frontend with Supabase authentication and PostgreSQL persistence, with row-level security protecting user-owned reports.

## Overview

Pulse Analytics was built to solve a common analytics workflow: turning raw CSV business data into an interactive performance report without requiring users to manually calculate KPIs or build charts.

The application supports:

* CSV-based business data analysis
* KPI calculation
* Current vs previous period comparison
* Interactive data visualization
* Deterministic performance insights
* User authentication
* Saved reports
* Secure user-specific data access

## Core Features

### Authentication

Implemented authentication using Supabase Auth with:

* Email/password signup
* Email verification
* Resend verification email
* Login/logout
* Password recovery
* Password reset
* PKCE authentication callback handling
* Recovery-session handling

### CSV Processing

Users can upload business performance CSV files containing:

```text
Date,Leads,Calls,Visits,Revenue,Conversions
```

The application validates the uploaded dataset before processing it.

Validation includes:

* Required column validation
* Date validation
* Numeric value validation
* Invalid/missing data handling

CSV parsing is performed in the browser using **Papa Parse**.

### Business Analytics

The application calculates key business metrics including:

* Leads
* Calls
* Visits
* Revenue
* Conversions
* Conversion rates
* Period-over-period changes

The dashboard compares the current reporting period against a previous period to help identify performance changes.

### Data Visualization

Interactive charts are generated using **Chart.js** to visualize business performance and make changes easier to understand.

### Performance Insights

Pulse Analytics generates deterministic insights based on calculated metrics and period comparisons.

For example:

* Revenue increased compared with the previous period.
* Conversion performance declined.
* Lead volume increased while conversion efficiency decreased.

The insights are generated from the underlying data rather than randomly generated AI text, making the results reproducible.

### Saved Reports

Authenticated users can save their analytics reports to PostgreSQL through Supabase.

Each report is associated with the authenticated user's ID.

### Database Security

The application uses **PostgreSQL Row Level Security (RLS)** to ensure users can access only their own reports.

The database contains:

* `profiles`
* `reports`
* `report_rows`

A profile creation trigger is also used to create user profile records automatically.

## Architecture

```text
                    ┌──────────────────────┐
                    │       User           │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Pulse Analytics    │
                    │   Vanilla JavaScript │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        CSV Processing     Analytics        Chart.js
        Papa Parse         Engine           Visualizations
              │                │
              └────────┬───────┘
                       │
                       ▼
                ┌───────────────┐
                │    Supabase   │
                │ Auth + DB     │
                └───────┬───────┘
                        │
                        ▼
                PostgreSQL + RLS
```

## Technology Stack

| Technology         | Purpose                               |
| ------------------ | ------------------------------------- |
| HTML5              | Application structure                 |
| CSS3               | Responsive UI and styling             |
| JavaScript         | Application logic and data processing |
| Supabase Auth      | Authentication and user sessions      |
| PostgreSQL         | Persistent report storage             |
| Row Level Security | User-level database protection        |
| Papa Parse         | CSV parsing                           |
| Chart.js           | Data visualization                    |
| Vercel             | Static deployment                     |
| Git/GitHub         | Version control                       |

## Project Structure

```text
pulse-analytics/
│
├── index.html        # Application UI
├── style.css         # Styling and responsive layout
├── app.js            # Application logic and analytics
├── config.js         # Browser-safe Supabase configuration
├── schema.sql        # Database schema and RLS policies
└── README.md         # Project documentation
```

## Engineering Highlights

### Client-Side Data Processing

CSV data is processed directly in the browser before persistence. This reduces unnecessary server-side processing for the initial analytics workflow.

### Secure Authentication

Authentication and session management are delegated to Supabase Auth rather than implementing password handling manually.

### Row-Level Data Isolation

Reports are protected using PostgreSQL RLS policies based on the authenticated user's ID.

### Deterministic Analytics

Business insights are generated from calculated metrics and predefined analytical rules, making the output predictable and reproducible.

### Static Deployment

The application is designed as a static frontend and can be deployed directly through Vercel without requiring a traditional application server.

## Security Considerations

The frontend contains only the browser-safe Supabase publishable key.

No Supabase service-role or secret key is exposed to the client.

User reports are protected through PostgreSQL Row Level Security.

CSV processing happens in the browser before report persistence.

For a larger production deployment, additional infrastructure could include:

* Custom SMTP
* Rate limiting
* CAPTCHA/bot protection
* Automated testing
* Application monitoring
* Error tracking

## What I Built

This project demonstrates practical experience with:

* Frontend application architecture
* JavaScript data processing
* Authentication flows
* CSV data validation
* KPI and business metric calculations
* Data visualization
* PostgreSQL data persistence
* Row Level Security
* Responsive web development
* Git-based development
* Static cloud deployment

## Future Improvements

Potential improvements include:

* Excel file support
* More configurable reporting periods
* Exportable PDF reports
* Additional business metrics
* Dashboard customization
* Automated testing
* Advanced analytics
* Team/workspace-based reporting

## Author

**Akash Patwa**

Web Developer focused on JavaScript, modern web applications, data-driven interfaces, and AI-assisted development.
