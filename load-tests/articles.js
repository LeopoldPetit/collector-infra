import http from 'k6/http';
import { check } from 'k6';

const API = __ENV.API_URL || 'https://api.localhost:8443';
const KC = __ENV.KC_URL || 'https://keycloak.localhost:8443';
const USER = __ENV.LOAD_USER || 'vendeur-demo';
const PASSWORD = __ENV.LOAD_PASSWORD || 'vendeur-demo';

// Le token Keycloak dure 300 s : la durée totale du scénario doit rester inférieure.
const stages = (vus) => [
  { duration: '30s', target: vus },
  { duration: '1m', target: vus },
  { duration: '20s', target: 0 },
];

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    get_articles: {
      executor: 'ramping-vus',
      exec: 'getArticles',
      stages: stages(20),
    },
    post_articles: {
      executor: 'ramping-vus',
      exec: 'postArticle',
      stages: stages(5),
    },
  },
  thresholds: {
    'http_req_failed{endpoint:get_articles}': ['rate<0.01'],
    'http_req_duration{endpoint:get_articles}': ['p(95)<500'],
    'http_req_failed{endpoint:post_articles}': ['rate<0.01'],
    'http_req_duration{endpoint:post_articles}': ['p(95)<800'],
  },
};

export function setup() {
  const res = http.post(
    `${KC}/realms/collector-shop/protocol/openid-connect/token`,
    { grant_type: 'password', client_id: 'collector-frontend', username: USER, password: PASSWORD },
    { insecureSkipTLSVerify: true },
  );
  check(res, { 'token obtenu': (r) => r.status === 200 });
  return { token: res.json('access_token') };
}

export function getArticles() {
  const res = http.get(`${API}/articles`, { tags: { endpoint: 'get_articles' } });
  check(res, { 'GET /articles 200': (r) => r.status === 200 });
}

export function postArticle(data) {
  const payload = JSON.stringify({
    title: `Charge VU${__VU}-IT${__ITER}`,
    description: 'Article créé par le test de charge k6, description suffisamment longue pour la validation.',
    price: 42,
    shippingCost: 5,
    category: 'timbres',
  });
  const res = http.post(`${API}/articles`, payload, {
    headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' },
    tags: { endpoint: 'post_articles' },
  });
  check(res, { 'POST /articles 201': (r) => r.status === 201 });
}
