# IELTSly API

> REST API backend for the IELTSly IELTS Writing preparation platform. Handles essay storage and AI evaluation, question bank management, analytics, band score calculation, and encrypted API key management.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express.js |
| Language | TypeScript |
| Database | MongoDB (Mongoose) |
| Auth | Better Auth + MongoDB adapter |
| AI SDK | Vercel AI SDK (`@ai-sdk/google`, `@ai-sdk/openai`) |
| Scraping | Playwright (Chromium) |
| Containerization | Docker |
| Deployment | Render |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm
- MongoDB (local or Atlas)

### Installation

```bash
git clone https://github.com/Jeremi-code/IELTSly-API.git
cd IELTSly-API
pnpm install
```

### Environment Variables

Create a `.env` file in the root:

```env
# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# MongoDB
MONGO_URI=mongodb://localhost:27017/ieltsly

# Better Auth
BETTER_AUTH_SECRET=your_secret_here
BETTER_AUTH_URL=http://localhost:5000

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Encryption (AES-256-GCM for BYOK API keys)
ENCRYPTION_KEY=your_32_byte_hex_key
```

### Run Locally

```bash
pnpm dev
```

Server runs at [http://localhost:5000](http://localhost:5000).

Health check: `GET /health`

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | Register with email & password |
| `POST` | `/api/auth/sign-in/email` | Sign in with email & password |
| `POST` | `/api/auth/sign-in/social` | Sign in with Google OAuth |
| `POST` | `/api/auth/sign-out` | Sign out |
| `GET` | `/api/auth/get-session` | Get current session |

### Essays
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/essays` | Create essay draft |
| `GET` | `/api/essays` | List essays (paginated, filterable) |
| `GET` | `/api/essays/:id` | Get single essay |
| `PUT` | `/api/essays/:id` | Update draft |
| `POST` | `/api/essays/:id/evaluate` | Trigger AI evaluation |
| `POST` | `/api/essays/:id/rework` | Rework an evaluated essay |
| `DELETE` | `/api/essays/:id` | Delete essay |

### Questions
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/questions` | List questions (paginated, filterable) |
| `GET` | `/api/questions/categories` | Get available categories |
| `GET` | `/api/questions/:id` | Get single question |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analytics` | Log writing session analytics |
| `GET` | `/api/analytics/summary` | Get performance summary |
| `GET` | `/api/analytics/daily-comment` | Get AI-generated coach comment |

### User
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/user/target` | Get writing band target |
| `PUT` | `/api/user/target` | Update band target |
| `GET` | `/api/user/ai-credentials` | Get AI key connection status |
| `POST` | `/api/user/ai-credentials` | Save encrypted AI key |
| `DELETE` | `/api/user/ai-credentials` | Remove AI key |

### Mock Scores
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/mock-scores` | List logged external test scores |
| `POST` | `/api/mock-scores` | Log an external test score |
| `DELETE` | `/api/mock-scores/:id` | Delete a score entry |

---

## Project Structure

```
src/
├── configs/
│   └── auth.ts             # Better Auth configuration
├── controllers/            # Route handler logic
├── middleware/             # Auth guard, error handler
├── models/                 # Mongoose schemas
├── routes/                 # Express route definitions
├── scripts/
│   └── scrape-liz.ts       # IELTS Liz question scraper
├── services/
│   ├── credential.service.ts   # Encrypted BYOK key management
│   ├── evaluation.service.ts   # AI evaluation orchestration
│   └── scraper.service.ts      # Playwright scraping logic
├── types/                  # Shared TypeScript types
├── utils/                  # Crypto, text helpers
└── zod/                    # Request/response validation schemas
```

---

## Security

- **Session auth** via Better Auth with HttpOnly, Secure, SameSite cookies
- **AI API keys** encrypted at rest using AES-256-GCM (`ENCRYPTION_KEY` env var) — only the masked key is ever returned to the client
- **CORS** restricted to `FRONTEND_URL` with credentials support
- **Auth guard middleware** protects all non-public routes

---

## Deployment (Render)

The API is containerized with Docker and deployed to Render.

**Required environment variables on Render:**

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/ieltsly
BETTER_AUTH_SECRET=<secret>
BETTER_AUTH_URL=https://ieltsly.netlify.app
FRONTEND_URL=https://ieltsly.netlify.app
ENCRYPTION_KEY=<32-byte-hex>
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
```
---

## Related

- **[IELTSly](https://github.com/Jeremi-code/IELTSly)** — Next.js frontend

---

## License

MIT
