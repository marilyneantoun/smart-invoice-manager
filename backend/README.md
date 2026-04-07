# InvoiceShield — Backend (Node.js)

## File Structure

```
backend/
├── server.js                      ← Entry point — starts Express, registers routes
├── package.json
├── .env.example                   ← Copy to .env and fill in your values
│
├── config/
│   └── db.js                      ← MySQL connection pool (all queries use this)
│
├── controllers/
│   └── authController.js          ← Login / logout / getMe logic
│
├── routes/
│   └── authRoutes.js              ← Maps URLs to controller functions
│
└── middleware/
    ├── authMiddleware.js          ← protect() + allowRoles() — guards routes
    └── errorHandler.js            ← Global error handler (last middleware)
```

---

## Setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Open `.env` and set your values — especially `JWT_SECRET` (make it long and random).

### 3. Make sure XAMPP is running
- Start **Apache** and **MySQL** in XAMPP
- Import `Db_final_v2.sql` in phpMyAdmin if you haven't already
- Import `sample_data_v3.sql` for test users

### 4. Start the server
```bash
npm run dev      # development (auto-restarts on file changes)
npm start        # production
```

You should see:
```
✅  InvoiceShield API running on http://localhost:5000
```

---

## API Endpoints

| Method | URL              | Auth required | Description                   |
|--------|------------------|---------------|-------------------------------|
| POST   | /api/auth/login  | No            | Login with email + password   |
| POST   | /api/auth/logout | Yes (JWT)     | Revoke all active tokens      |
| GET    | /api/auth/me     | Yes (JWT)     | Get current user profile      |
| GET    | /api/health      | No            | Check if server is running    |

---

## Login Request & Response

**Request body:**
```json
{
  "email": "accountant@example.com",
  "password": "yourpassword"
}
```

**Success response (200):**
```json
{
  "message": "Login successful.",
  "token": "eyJhbGci...",
  "user": {
    "user_id": 1,
    "full_name": "Jane Smith",
    "email": "accountant@example.com",
    "role_name": "Accountant"
  }
}
```

**Error response (401):**
```json
{
  "message": "Invalid email or password."
}
```

---

## How to use the JWT on protected routes

Send the token in every request header:
```
Authorization: Bearer eyJhbGci...
```

Frontend example (fetch):
```js
const token = localStorage.getItem('token');

const res = await fetch('http://localhost:5000/api/auth/me', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Connecting the frontend

Replace the `LoginForm.jsx` in your React project with the provided
`LoginForm.updated.jsx` — it calls the real backend instead of the simulation.

---

## How passwords are stored

Passwords are hashed with **bcrypt** before storing in the database.
The sample data already has hashed passwords. To generate a hash for a new user:

```js
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('yourpassword', 10);
console.log(hash); // store this in password_hash column
```
