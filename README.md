# Bhutan Trips by Druk Asia - MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets AI
assistants Claude, ChatGPT, Cursor, OpenClaw, Hermes and others search and book Bhutan trips.

[![MCP](https://img.shields.io/badge/MCP-server-6e3fbb)](https://modelcontextprotocol.io)
[![MCP Badge](https://lobehub.com/badge/mcp/ebizity-bhutan-trips-by-druk-asia)](https://lobehub.com/mcp/ebizity-bhutan-trips-by-druk-asia)

## Features

- **Festivals** - Bhutan's festival calendar by year
- **Itineraries** - day-by-day tours with hotels, activities and live pricing
- **Flights** - live Drukair availability and pricing
- **Destinations** - entry/exit ports for bookings
- **Members** - create and look up travellers
- **Bookings** - create, fetch and update bookings
- **Payments** - create payments and check status

## Quick start

Point your MCP client at:

```
https://mcp.drukasia.com/mcp
```

On first use, your client opens a **sign in / sign up** page (OAuth 2.1). Accounts are
self-serve and your Druk Asia API key is created automatically — you never handle keys.

### Connect in ChatGPT

1. **ChatGPT** (desktop) → **Settings** → **MCP**.
2. Add a remote server with the URL `https://mcp.drukasia.com/mcp`.
3. Complete sign-in/sign-up in the browser popup.
4. Ask: *"Use the Bhutan Trips tools to list festivals in 2026."*

### Connect in Claude

1. **Claude Desktop** → **Settings** → **MCP servers** → **Add remote server** → enter the URL.
2. Or in **Claude Code**: `/mcp` → add remote → `https://mcp.drukasia.com/mcp`.
3. Complete the OAuth flow in the browser.

## Tools

| Tool | Endpoint | Description |
| --- | --- | --- |
| `list_endpoints` | — | Reference of all endpoints and their tools |
| `list_festivals` | `GET /v1/festivals` | Festival calendar for a year |
| `list_itineraries` | `GET /v1/itineraries` | Itineraries with party-based pricing |
| `get_itinerary` | `GET /v1/itineraries/{id}` | Single itinerary by ID |
| `search_flights` | `GET /v1/flights` | Live flight availability + pricing |
| `list_destinations` | `GET /v1/destinations` | Entry/exit destination IDs |
| `create_member` | `POST /v1/members` | Create a member |
| `get_member` | `GET /v1/members/{id}` | Fetch a member |
| `get_booking` | `GET /v1/bookings` | Fetch a booking by reference |
| `create_booking` | `POST /v1/bookings` | Create a booking |
| `update_booking` | `PATCH /v1/bookings/{booking_ref}` | Update editable booking fields |
| `create_payment` | `POST /v1/da-payments` | Create an Airwallex payment |
| `get_payment_status` | `POST /v1/da-payments/status` | Check whether a payment succeeded |

> **Read vs write:** Most tools are read-only. `create_member`, `create_booking`,
> `update_booking`, and `create_payment` write real data (members, bookings, payments).

## Example

> *"Find 7-day cultural itineraries for 2 adults in October 2026, then check flights
> from Singapore."*

The assistant chains `list_itineraries` → `search_flights` → `list_destinations` →
`create_member` → `create_booking` → `create_payment` to complete a real booking.

## Authentication

The server uses **OAuth 2.1** (authorization code + PKCE). Clients log in and receive a
short-lived access token; the server maps that token to the user's stored Druk Asia API
key. Keys never leave the server.

## Self-hosting

You can run the server yourself instead of using the hosted endpoint.

### Prerequisites

- Node.js >= 18.18

### stdio

```bash
git clone https://github.com/ebizity/bhutan-trips-by-druk-asia.git
cd bhutan-trips-by-druk-asia
npm install
npm run build
```

Add it to your MCP client:

```json
{
  "mcpServers": {
    "bhutan-trips-by-druk-asia": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "DRUKASIA_API_KEY": "your-api-key"
      }
    }
  }
}
```

### HTTP server

```bash
npm run start:http
```

Serves the Streamable HTTP endpoint at `http://localhost:3000/mcp` (POST) with OAuth.

### Docker

```bash
docker build -t bhutan-trips-by-druk-asia .
docker run -p 3000:3000 bhutan-trips-by-druk-asia
```

### Cloudflare Worker

```bash
npx wrangler secret put JWT_SECRET
npm run deploy
```

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DRUKASIA_API_KEY` | stdio only | — | Agent Bot API key, sent as the `x-api-key` header |
| `DRUKASIA_API_BASE_URL` | no | `https://api.bhutan.pro` | Base URL of the Druk Asia v1 API |
| `MCP_PUBLIC_BASE_URL` | hosted | request origin | Public base URL used in OAuth metadata |
| `CORS_ORIGINS` | no | allow all | Comma-separated browser origins allowed to call the API |
| `JWT_SECRET` | hosted | dev fallback | OAuth token-signing secret (`wrangler secret put JWT_SECRET`) |

## License

[MIT](LICENSE) © Druk Asia

## Links

- [Druk Asia](https://www.drukasia.com)
- [LobeHub Marketplace](https://lobehub.com/mcp/ebizity-bhutan-trips-by-druk-asia)
- [MCP Registry](https://registry.modelcontextprotocol.io)
- [Model Context Protocol](https://modelcontextprotocol.io)
