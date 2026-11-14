# DAH SWEET

Full-stack ordering app for a restaurant and gaming lounge. Node.js + Express, data in `data/db.json`, plain HTML/CSS/JS front end.

## Run it
1. Install Node.js 18 or newer.
2. In the VS Code terminal, inside this folder:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000

On the first run the terminal prints the admin email and password. To choose your own, set them before the first run:
- Windows PowerShell: `$env:ADMIN_EMAIL="you@mail.com"; $env:ADMIN_PASSWORD="your-password"; npm start`
- Mac/Linux: `ADMIN_EMAIL=you@mail.com ADMIN_PASSWORD=your-password npm start`

To start over with fresh data, stop the server and delete `data/db.json`.

## Roles
- Customer: creates an account, orders food and drinks, books games, pays by transfer.
- Worker: Staff page. Confirms payments, completes orders, sets availability and stock. Added by the admin.
- Admin: only one exists and it cannot be created from the site. Sees every sign-in live, manages workers, prices, items, payment accounts and phone number.

## Notes
- Stock drops when an order is placed and returns if the order is cancelled.
- Games have no stock count. Mark them available or unavailable on the Stock page.
- Payment is by bank transfer. A customer enters their transfer reference and staff confirm after checking the account. There is no card gateway.
- Prices not given in the brief (plantain, white rice and yarser) are set to 1,000 and 4,000. Change them in Admin > Staff > Stock.
- Before going online, put the app behind HTTPS (for example with a reverse proxy).
