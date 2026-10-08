import { COOKIE } from '../lib/auth.js';
export default function handler(req, res) {
  res.setHeader('set-cookie', `${COOKIE}=; Path=/; Max-Age=0`);
  res.setHeader('location', '/login');
  res.status(303).end();
}
