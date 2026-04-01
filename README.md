# BrandSoul

<p align="center">
  <strong>Give your brand a living voice.</strong><br/><br/>
  <a href="[https://brandsoul.app](https://brandsoul-1.onrender.com/)" target="_blank">
    🚀 Experience BrandSoul Live
  </a>
</p>

> **Giving brands a living voice.**

![Status](https://img.shields.io/badge/status-beta-ff8a4c)
![Stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20React-6e86ff)
![Build](https://img.shields.io/badge/build-passing-3ec590)
![License](https://img.shields.io/badge/license-MIT-f2f4ff)

---

## BrandSoul Banner

**BrandSoul** is a platform where a business gains a living digital identity called **Centelha**.

It does not just answer.
It speaks with brand personality, understands context, organizes information, and moves people toward action.

---

## Product Vision

Most chat experiences feel generic, transactional, and forgettable.

BrandSoul was built to solve a more strategic problem:

- brands need presence, not just automation
- service businesses need conversion, not just chat
- professional brands need guidance, trust, and structure

**Centelha** is the answer.

Instead of a cold bot, BrandSoul creates a brand entity with:

- voice
- tone
- behavior
- memory
- action logic

This turns the interface from a support widget into a living front layer of the business.

---

## What Makes It Different

- It is not a generic chatbot.
- It is not only a scheduling form.
- It is not only a lead capture tool.

BrandSoul combines identity, conversation, guidance, and conversion in one modular system.

The result is a product that can:

- represent the brand
- conduct a service flow
- organize a case
- generate a dossier
- push the next action to WhatsApp or scheduling

---

## Mental Demo

Here is the experience in practice:

1. A visitor enters the public page of a brand.
2. They meet the **Centelha**, already aligned with that brand's tone and intent.
3. They start a conversation.
4. If needed, the flow can shift into service, guidance, emergency, or scheduling.
5. BrandSoul structures the interaction in real time.
6. The visitor is guided toward a concrete next step:
   WhatsApp, booking, case submission, or direct follow-up.

This is where BrandSoul becomes more than chat.
It becomes operational intelligence on the customer-facing layer.

---

## Core Features

- Brand AI with personality and contextual behavior
- Professional guidance mode with controlled language
- Emergency-oriented flow with guided case intake
- Live dossier generation during orientation
- Evidence collection with photo, video, and audio metadata
- WhatsApp forwarding with structured summaries
- Scheduling flow with recurring availability
- Multiple attendance modes:
  presencial, online, and in-home
- Admin panel for configuring identity, behavior, CTA, public experience, and operations

---

## Architecture

BrandSoul is organized as a modular full-stack system.

- **Frontend**
  React + TypeScript + Vite
- **Backend**
  FastAPI + Pydantic + SQLite
- **AI Layer**
  OpenAI
- **Messaging / Recovery**
  Resend for password recovery email
- **Operational Channels**
  WhatsApp redirection and action-driven flows

### High-Level Flow

```text
User
  ↓
Public Brand Page
  ↓
Centelha Experience Layer
  ↓
FastAPI Backend
  ↓
Brand Config + Catalog + Scheduling + Guidance Logic
  ↓
OpenAI / WhatsApp / Email / Admin Operations
```

---

## Repository Structure

```text
flow_core_group/
├── brandsoul/            # FastAPI backend
├── brandsoul-frontend/   # React frontend
└── README.md             # Product overview
```

---

## Run Locally

### Backend

```bash
cd brandsoul
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend default URL:

```text
http://127.0.0.1:8000
```

Swagger:

```text
http://127.0.0.1:8000/docs
```

### Frontend

```bash
cd brandsoul-frontend
npm install
npm run dev
```

Frontend default URL:

```text
http://localhost:5173
```

---

## Environment

Example variables commonly used in development:

```env
OPENAI_API_KEY=your_key
JWT_SECRET=your_secret
ALLOWED_ORIGINS=http://localhost:5173
RESEND_API_KEY=your_resend_key
EMAIL_FROM=noreply@yourdomain.com
PASSWORD_RESET_URL_BASE=http://localhost:5173/reset-password
```

---

## Roadmap

- [x] Brand conversation with Centelha
- [x] Admin editing for identity and behavior
- [x] Professional guidance mode
- [x] Case dossier generation
- [x] WhatsApp forwarding
- [x] Intelligent scheduling
- [x] Multiple attendance modes
- [x] Password recovery flow
- [ ] Real-time notifications
- [ ] Dedicated mobile app
- [ ] Marketplace and ecosystem integrations
- [ ] Deeper business analytics layer

---

## Future Direction

BrandSoul is being designed as more than a single-product interface.

The long-term vision is an ecosystem where:

- brands operate with living AI identities
- service businesses convert from conversation to operation
- professional brands guide with safety and structure
- workflows move naturally into messaging, scheduling, and decision systems
- multiple business entities can evolve into an interoperable network

This is the foundation for a broader layer of business intelligence where identity, action, and automation are merged.

---

## Why It Matters

The future of digital presence is not static branding.

It is **responsive identity**.

BrandSoul turns brand expression into something alive, operational, and conversion-oriented.

---

## Author

**Andrew Michael de Oliveira**  
Founder, **Flow Core Group**

---

## License

MIT

