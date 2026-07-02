Rands WhatsApp Concierge Architecture

reply.ts
- Orchestration only
- Never contains business logic

action-router.ts
- Routes intents to services
- No business logic

state-engine.ts
- Handles conversation states only

services/
- Business logic only
- Return ActionResult
- Never call AI directly
- Never contain routing logic

customer.ts
- Customer data access only

state.ts
- Conversation state persistence only

Supabase
- All persistence goes through service/data layers

Do not move responsibilities between files.
Maintain existing interfaces unless explicitly instructed.
