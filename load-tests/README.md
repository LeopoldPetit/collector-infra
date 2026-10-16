# Tests de charge (k6)

Script : [articles.js](articles.js). Il cible l'API via l'ingress Minikube (`https://api.localhost:8443`) et obtient un token vendeur via Keycloak (`vendeur-demo`).

## Lancer le test

Prérequis : k6, cluster Minikube démarré, `kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 8443:443` actif.

```sh
k6 run load-tests/articles.js
```

Variables facultatives : `API_URL`, `KC_URL`, `LOAD_USER`, `LOAD_PASSWORD`.

## Scénario

| Scénario | Endpoint | VUs max | Durée |
|---|---|---|---|
| `get_articles` | `GET /articles` (public) | 20 | 1 min 50 |
| `post_articles` | `POST /articles` (vendeur, statut draft) | 5 | 1 min 50 |

Le token Keycloak dure 300 s. La durée du test doit donc rester inférieure à cette valeur.

## Résultats (exécution du 16/10/2026, poste de développement)

| Métrique | GET /articles | POST /articles |
|---|---|---|
| Requêtes | 7 442 | 1 730 |
| Échecs HTTP | 0 % | 0 % |
| Latence moyenne | 229,9 ms | 252,0 ms |
| Médiane | 239,9 ms | 211,8 ms |
| p90 | 428,9 ms | 564,2 ms |
| p95 | 466,0 ms (seuil 500 ms) | 679,0 ms (seuil 800 ms) |
| Latence max | 986 ms | 1,11 s |

Global : 9 173 requêtes, environ 83 req/s, 100 % des checks réussis, tous les seuils respectés.

## Analyse

- Aucune erreur sous charge sur les deux endpoints.
- Les seuils p95 sont respectés, mais la marge est faible sur `GET /articles` (466 ms pour 500 ms).
- Le volume reçu est de 2,7 Go pour 7 442 GET, soit environ 360 Ko par réponse. `GET /articles` ne propose ni pagination ni limite dans le contrôleur. C'est un point à traiter en phase 3.
- Les POST créent environ 1 730 articles en draft. Le worker de modération était arrêté pendant le test, donc les messages se sont accumulés dans la file `moderation`.

## Limites

- Une seule exécution, sur un cluster Minikube local : les chiffres ne sont pas représentatifs d'une production.
- Le client k6 et le cluster partagent la même machine.
- Le token est obtenu une seule fois dans `setup()`.
