import { z } from "zod";
import type { ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ApiError, DrukAsiaClient } from "./client.js";

const API_KEY_NOTE =
  "Requires a valid Druk Asia API key (sent automatically via the `x-api-key` header).";

function toResult<T>(fn: () => Promise<T>): Promise<CallToolResult> {
  return fn().then(
    (data) => ({
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    }),
    (err: unknown) => {
      if (err instanceof ApiError) {
        const detail =
          typeof err.body === "string"
            ? err.body
            : JSON.stringify(err.body, null, 2);
        return {
          content: [
            {
              type: "text" as const,
              text: `Druk Asia API request failed (HTTP ${err.status}):\n${detail}`,
            },
          ],
          isError: true,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          { type: "text" as const, text: `Unexpected error: ${message}` },
        ],
        isError: true,
      };
    },
  );
}

const ispopularEnum = z.enum(["true", "false", "1", "0"]);

/**
 * Identifiers that are placed into upstream URL paths or queries. Restricting
 * the alphabet blocks path tricks such as "..", which would otherwise resolve
 * `/v1/bookings/..` to `/v1/`.
 */
const identifier = (label: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, `${label} may only contain letters, digits, '-' and '_'`);

/** Hints for MCP clients so they can ask the user before acting. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
const CREATES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const MODIFIES = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;

function bookingFields(): ZodRawShape {
  return {
    itinerary_id: z
      .number()
      .int()
      .describe("Numeric itinerary ID (from list_itineraries or get_itinerary)."),
    tour_start_date: z
      .string()
      .describe("Tour start date in ISO date-time format, e.g. 2026-12-01T00:00:00.000Z."),
    tour_end_date: z
      .string()
      .describe("Tour end date in ISO date-time format, e.g. 2026-12-07T00:00:00.000Z."),
    port_entry_id: z
      .number()
      .int()
      .describe("Arrival port Destination.Id. Must reference a destination where isEntry = 1. See list_destinations."),
    port_exit_id: z
      .number()
      .int()
      .describe("Departure port Destination.Id. Must reference a destination where isExit = 1. See list_destinations."),
    member_id: z
      .string()
      .describe("Member ID. Create one first with create_member if not done yet."),
    total_adult_pax: z.number().int().describe("Total adult passengers."),
    total_child_pax: z.number().int().describe("Total child passengers."),
    total_infant_pax: z.number().int().describe("Total infant passengers."),
    total_adult_air_ticket: z.number().int().describe("Total adult air tickets."),
    total_child_air_ticket: z.number().int().describe("Total child air tickets."),
    total_infant_air_ticket: z.number().int().describe("Total infant air tickets."),
    is_trekking_group: z
      .boolean()
      .describe("Whether this booking is a trekking group."),
    single_supplement_cost: z.number().describe("Single room supplement cost."),
    trekking_cost: z.number().describe("Trekking cost."),
    total_visa_cost: z.number().describe("Total visa cost."),
    total_land_tour_price: z.number().describe("Total land tour price."),
    credit_card_charge: z.number().describe("Credit card processing charge."),
    total_air_ticket_price: z.number().describe("Total air ticket price."),
    grand_total: z.number().describe("Grand total amount."),
  };
}

/**
 * Fields update_booking may change. Price, party size and itinerary are
 * excluded: those values determine what the customer owes, and must not be
 * rewritten by a model (or a prompt injection) after the booking is created.
 * To change them, create a new booking.
 */
function bookingUpdateFields(): ZodRawShape {
  const all = bookingFields() as Record<string, z.ZodTypeAny>;
  const editable = ["tour_start_date", "tour_end_date", "port_entry_id", "port_exit_id"] as const;
  return Object.fromEntries(editable.map((key) => [key, all[key].optional()]));
}

const ENDPOINT_REFERENCE = {
  server: "https://api.bhutan.pro",
  auth: "x-api-key header (Agent Bot API key)",
  endpoints: [
    { method: "GET", path: "/v1/festivals", tool: "list_festivals", params: "year (required), ispopular" },
    { method: "GET", path: "/v1/itineraries", tool: "list_itineraries", params: "adults, children, infants, days, itinerary_category, single_rooms" },
    { method: "GET", path: "/v1/itineraries/{id}", tool: "get_itinerary", params: "id (path)" },
    { method: "GET", path: "/v1/flights", tool: "search_flights", params: "departure_airport, arrival_airport (required), departure_date, return_date, adults, children, infants" },
    { method: "GET", path: "/v1/destinations", tool: "list_destinations", params: "none" },
    { method: "POST", path: "/v1/members", tool: "create_member", params: "email, fullname, phone_country_code, phone_number" },
    { method: "GET", path: "/v1/members/{id}", tool: "get_member", params: "id (path)" },
    { method: "GET", path: "/v1/bookings", tool: "get_booking", params: "booking_ref (query)" },
    { method: "POST", path: "/v1/bookings", tool: "create_booking", params: "20 booking fields (see tool schema)" },
    { method: "PATCH", path: "/v1/bookings/{booking_ref}", tool: "update_booking", params: "booking_ref (path) + tour dates / entry and exit ports" },
    { method: "POST", path: "/v1/da-payments", tool: "create_payment", params: "online_booking_id, booking_ref_code, amount (payment link only)" },
    { method: "POST", path: "/v1/da-payments/status", tool: "get_payment_status", params: "online_booking_id" },
  ],
};

export function registerTools(server: McpServer, client: DrukAsiaClient): void {
  server.registerTool(
    "list_endpoints",
    {
      title: "List Druk Asia v1 API endpoints",
      annotations: READ_ONLY,
      description:
        "Returns a concise reference of all Druk Asia v1 API endpoints and the MCP tool that wraps each one.",
      inputSchema: {},
    },
    async () => toResult(() => Promise.resolve(ENDPOINT_REFERENCE)),
  );

  server.registerTool(
    "list_festivals",
    {
      title: "List Festivals Calendar",
      annotations: READ_ONLY,
      description: `Retrieves upcoming festivals in Bhutan for a specified year, with an optional filter for popular festivals. ${API_KEY_NOTE}`,
      inputSchema: {
        year: z
          .number()
          .int()
          .min(2000)
          .max(2100)
          .describe("Calendar year to fetch festivals for (e.g. 2026)."),
        ispopular: ispopularEnum
          .optional()
          .describe("Filter popular festivals only: 'true', 'false', '1', or '0'."),
      },
    },
    async ({ year, ispopular }) =>
      toResult(() => client.get("/v1/festivals", { year, ispopular })),
  );

  server.registerTool(
    "list_itineraries",
    {
      title: "List & Price Tour Itineraries",
      annotations: READ_ONLY,
      description: `Retrieves itineraries with daily breakdown, hotels, and activities, including dynamic quotation pricing based on party composition and optional filters. ${API_KEY_NOTE}`,
      inputSchema: {
        adults: z.number().int().min(1).optional().describe("Number of adult travelers (default 1)."),
        children: z.number().int().min(0).optional().describe("Number of child travelers (default 0)."),
        infants: z.number().int().min(0).optional().describe("Number of infant travelers (default 0)."),
        days: z.number().int().min(1).optional().describe("Filter itineraries by duration in days."),
        itinerary_category: z
          .string()
          .optional()
          .describe("Optional English itinerary category URL, e.g. 'cultural'."),
        single_rooms: z.number().int().min(0).optional().describe("Number of single rooms requested."),
      },
    },
    async (args) => toResult(() => client.get("/v1/itineraries", args)),
  );

  server.registerTool(
    "get_itinerary",
    {
      title: "Get Itinerary by ID",
      annotations: READ_ONLY,
      description: `Retrieves a single itinerary by its numeric ID with day-by-day detail and pricing for one adult. ${API_KEY_NOTE}`,
      inputSchema: {
        id: z.number().int().min(1).describe("Positive numeric itinerary ID."),
      },
    },
    async ({ id }) => toResult(() => client.get(`/v1/itineraries/${id}`)),
  );

  server.registerTool(
    "search_flights",
    {
      title: "Search Flights & Pricing",
      annotations: READ_ONLY,
      description: `Searches live Drukair flight availability and calculates flight pricing for the party. Leave return_date empty for one-way. ${API_KEY_NOTE}`,
      inputSchema: {
        departure_airport: z
          .string()
          .min(3)
          .max(4)
          .describe("Departure airport 3-letter IATA code (e.g. SIN, BKK, DEL, KTM)."),
        arrival_airport: z
          .string()
          .min(3)
          .max(4)
          .describe("Arrival airport 3-letter IATA code (e.g. PBH)."),
        departure_date: z
          .string()
          .optional()
          .describe("Departure date YYYY-MM-DD (default 2026-12-01)."),
        return_date: z
          .string()
          .optional()
          .describe("Return date YYYY-MM-DD (default 2026-12-07). Omit for one-way."),
        adults: z.number().int().min(1).optional().describe("Adult passengers (default 1)."),
        children: z.number().int().min(0).optional().describe("Child passengers (default 0)."),
        infants: z.number().int().min(0).optional().describe("Infant passengers (default 0)."),
      },
    },
    async (args) => toResult(() => client.get("/v1/flights", args)),
  );

  server.registerTool(
    "list_destinations",
    {
      title: "List Destinations",
      annotations: READ_ONLY,
      description: `Returns destination IDs and titles for use as port_entry_id and port_exit_id in bookings. isEntry and isExit indicate whether a destination can be used for entry or exit. ${API_KEY_NOTE}`,
      inputSchema: {},
    },
    async () => toResult(() => client.get("/v1/destinations")),
  );

  server.registerTool(
    "create_member",
    {
      title: "Create Member",
      annotations: CREATES,
      description: `Creates a member using contact details. IsActive and Status are always set to true by the API. ${API_KEY_NOTE}`,
      inputSchema: {
        email: z.string().email().describe("Member email address."),
        fullname: z.string().min(1).describe("Member full name."),
        phone_country_code: z.string().min(1).describe("Phone country code, e.g. +975."),
        phone_number: z.string().min(1).describe("Phone number, e.g. 17123456."),
      },
    },
    async (args) => toResult(() => client.post("/v1/members", args)),
  );

  server.registerTool(
    "get_member",
    {
      title: "Get Member by ID",
      annotations: READ_ONLY,
      description: `Retrieves a member by ID. Password data is never returned. ${API_KEY_NOTE}`,
      inputSchema: {
        id: identifier("Member ID").describe("Member ID."),
      },
    },
    async ({ id }) => toResult(() => client.get(`/v1/members/${encodeURIComponent(id)}`)),
  );

  server.registerTool(
    "get_booking",
    {
      title: "Get Booking by Reference",
      annotations: READ_ONLY,
      description: `Retrieves a booking by its booking reference. ${API_KEY_NOTE}`,
      inputSchema: {
        booking_ref: identifier("Booking reference").describe("Booking reference (e.g. DA-26-X7K2PQ)."),
      },
    },
    async ({ booking_ref }) => toResult(() => client.get("/v1/bookings", { booking_ref })),
  );

  server.registerTool(
    "create_booking",
    {
      title: "Create Booking",
      annotations: CREATES,
      description: `Creates a booking and returns the generated booking reference and ID. A member ID must already exist (see create_member), and port_entry_id / port_exit_id must reference valid destinations (see list_destinations). ${API_KEY_NOTE}`,
      inputSchema: bookingFields(),
    },
    async (args) => toResult(() => client.post("/v1/bookings", args)),
  );

  server.registerTool(
    "update_booking",
    {
      title: "Update Booking",
      annotations: MODIFIES,
      description: `Updates the tour dates and/or entry and exit ports of an existing booking. Send only the fields to update. Prices, party size and itinerary cannot be changed here — create a new booking instead. ${API_KEY_NOTE}`,
      inputSchema: {
        booking_ref: identifier("Booking reference").describe("Booking reference to update."),
        ...bookingUpdateFields(),
      },
    },
    async ({ booking_ref, ...body }) =>
      toResult(() => client.patch(`/v1/bookings/${encodeURIComponent(booking_ref)}`, body)),
  );

  server.registerTool(
    "create_payment",
    {
      title: "Create Payment Link",
      annotations: CREATES,
      description: `Creates an Airwallex payment link for a booking and returns a URL the traveller opens to pay securely. Never ask the user for card numbers or CVCs in chat — card details are only ever entered on the payment page. ${API_KEY_NOTE}`,
      inputSchema: {
        online_booking_id: identifier("Booking ID").describe("OnlineBookings.Id (booking_id from create_booking)."),
        booking_ref_code: identifier("Booking reference").describe("Booking reference code, e.g. DA-26-X7K2PQ."),
        amount: z.number().positive().describe("Payment amount in USD."),
      },
    },
    // Card data must never pass through the model/MCP layer (PCI DSS), so the
    // direct-charge ("auto_fill") mode is not exposed: payment links only.
    async ({ online_booking_id, booking_ref_code, amount }) =>
      toResult(() =>
        client.post("/v1/da-payments", {
          online_booking_id,
          booking_ref_code,
          amount,
          payment_type: "payment_link",
        }),
      ),
  );

  server.registerTool(
    "get_payment_status",
    {
      title: "Get Payment Status",
      annotations: READ_ONLY,
      description: `Checks whether a booking's payment has succeeded. ${API_KEY_NOTE}`,
      inputSchema: {
        online_booking_id: identifier("Booking ID").describe("OnlineBookings.Id (booking_id from create_booking)."),
      },
    },
    async ({ online_booking_id }) =>
      toResult(() => client.post("/v1/da-payments/status", { online_booking_id })),
  );
}
