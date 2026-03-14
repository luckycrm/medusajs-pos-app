# MedusajsPOS - Medusa v2 Point of Sale (POS) System

<p align="center">
  <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/logo.png" alt="Medusa POS Logo" />
</p>

A complete, modern Point of Sale solution built on top of the Medusa v2 framework. This repository manages both the staff-facing frontend and the specialized backend extensions required for physical retail operations.

---

## 📸 Screenshots

| Login Page | Cart Page | Orders Page |
|:---:|:---:|:---:|
| <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/screenshot/LOGINPAGE.png" width="300" /> | <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/screenshot/CARTPAGE.png" width="300" /> | <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/screenshot/ORDERSPAGE.png" width="300" /> |

---

## 🛠️ Prerequisites

- **Node.js** >= 22.12.0
- **PostgreSQL** (for Medusa)
- **Redis** (for Medusa)
- A Medusa v2 project

---

## 🚀 Quick Start

Follow these steps to set up the complete POS system:

### Step 1: Clone the Repository

```bash
git clone https://github.com/luckycrm/medusajs-pos-app.git
cd medusajs-pos-app
```

### Step 2: Install the Backend Plugin

Navigate to your existing Medusa v2 backend project and install the plugin:

```bash
cd your-medusa-backend
npm install medusajspos
```

### Step 3: Configure the Plugin

Open your `medusa-config.ts` and add the plugin:

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ... your existing config
  plugins: [
    {
      resolve: "medusajspos",
      options: {},
    },
  ],
})
```

### Step 4: Run Database Migrations

```bash
npx medusa db:migrate
```

This creates the `invoice` and `invoice_config` tables used by the plugin.

### Step 5: Start the Backend

```bash
npm run dev
```

Your Medusa backend should now be running (typically at `http://localhost:9000`).

---

### Step 6: Set Up the POS Frontend

1. Navigate to the frontend directory:
   ```bash
   cd medusajs-pos-app/medusajs-pos
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```env
   PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:4321`

---

## 📱 POS Access

- **Frontend**: http://localhost:4321
- **Medusa Admin**: http://localhost:9000/app
- **Medusa API**: http://localhost:9000

---

## 🔧 Configuration

### Plugin Options

The `medusajspos` plugin currently uses default settings. You can configure invoice settings through the Medusa Admin after installation.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_MEDUSA_BACKEND_URL` | Your Medusa backend URL | `http://localhost:9000` |

---

## 📂 Project Structure

```
medusajs-pos-app/
├── medusajs-pos/           # Astro + React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Astro pages
│   │   └── lib/            # Medusa SDK setup
│   └── package.json
│
└── medusajs-pos-helper/    # Medusa v2 plugin (npm package)
    ├── src/
    │   ├── api/            # Custom API routes
    │   ├── modules/        # Custom modules
    │   └── workflows/      # Custom workflows
    └── package.json
```

---

## 🧩 Features

### Backend Plugin (`medusajspos`)
- Barcode scanning for adding products to orders
- PDF invoice generation
- PDF packing list generation
- Order customer reassignment
- Custom admin extensions

### Frontend (`medusajs-pos`)
- Staff login and authentication
- Customer search and creation
- Product browsing
- Cart management
- Order processing
- Responsive design for tablets and desktops

---

## 🤝 Support

If you need help or have questions:
- Open an issue at https://github.com/luckycrm/medusajs-pos-app/issues
- Email: contact@lakhwindersingh.com

---

## 🌐 Socials:
[![Instagram](https://img.shields.io/badge/Instagram-%23E4405F.svg?logo=Instagram&logoColor=white)](https://instagram.com/thatlucifer) [![Medium](https://img.shields.io/badge/Medium-12100E?logo=medium&logoColor=white)](https://medium.com/@@lakhwindercan) [![email](https://img.shields.io/badge/Email-D14836?logo=gmail&logoColor=white)](mailto:contact@lakhwindersingh.com) 

---

## 🤝 Contributors

We welcome contributions from the community! Check out our [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to get started.

- [Lakhwinder Singh (Lucky)](https://github.com/luckycrm) - Lead Developer

---

## 💖 Funding & Support

If you find this project useful and want to support its continued development, please consider sponsoring us:

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/luckycrm)
[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/@thatlucifer)

Your support helps maintain and improve the MedusaJS POS system!

---

## 📄 License

MIT
