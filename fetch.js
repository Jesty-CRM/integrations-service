import fetch from "node-fetch";

const ACCESS_TOKEN = "EAAPAyZBHTKhwBPhZBfZCRnMN1jUo0PWfZBTEc7EwclyCZAfKDW704dyL3s67Ajx3zglwIzDggZADlpiIXS6hq7fLJGYK5thN9s9FhKrZABZAYoXo6TU8A3xMZBZB8vJMQiTCs0F5tRYW6kyde9mIPxaG85ZC9ZCRN14P2kZC9GcCxtkCUKmagOuBKEVjIGw2AuI7mQ2ZBgHMgkxhPJFRux5rGUahJE3y4bhY0mZAGOr";
const AD_ACCOUNT_ID = "act_487530193710625";

const endpoints = [
  `/${AD_ACCOUNT_ID}`,
  `/${AD_ACCOUNT_ID}/campaigns`,
  `/${AD_ACCOUNT_ID}/adsets`,
  `/${AD_ACCOUNT_ID}/ads`,
  `/${AD_ACCOUNT_ID}/adcreatives`,
  `/${AD_ACCOUNT_ID}/insights?date_preset=last_7d`
];

async function run() {
  for (let i = 0; i < 3; i++) {
    for (const endpoint of endpoints) {
      // Fix URL construction - need ? before access_token for most endpoints
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `https://graph.facebook.com/v21.0${endpoint}${separator}access_token=${ACCESS_TOKEN}`;
      
      console.log(`Fetching: ${url.replace(ACCESS_TOKEN, 'TOKEN_HIDDEN')}`);
      
      const res = await fetch(url);
      const responseText = await res.text();
      
      console.log(`${endpoint} - Status: ${res.status}`);
      if (res.status !== 200) {
        console.log(`Error response: ${responseText}`);
      }
      
      await new Promise(r => setTimeout(r, 1000)); // small delay
    }
  }
}

run();
