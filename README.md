# collector-infra

Infrastructure as Code du projet **Collector.shop** : environnement de développement local, charts Helm, workflows CI/CD réutilisables, configuration Vault et cert-manager.

## Rôle dans le projet

Ce repo porte le **socle technique** partagé par les autres services (`collector-catalog-api`, `collector-moderation-worker`, `collector-frontend`) :
- Environnement de développement local via Docker Compose (PostgreSQL, RabbitMQ, Keycloak, Vault)
- Charts Helm pour le déploiement sur Kubernetes (Minikube)
- Workflow GitHub Actions réutilisable (lint → tests → scan → build)
- Ingress + TLS (cert-manager)
- Stack d'observabilité (Prometheus, Grafana, Loki)

## Stack

| Composant | Rôle |
|---|---|
| Docker Compose | Environnement de dev local (Postgres, RabbitMQ, Keycloak, Vault) |
| Helm + Kubernetes (Minikube) | Orchestration et déploiement des services |
| Traefik / Ingress NGINX + cert-manager | Reverse proxy et HTTPS |
| HashiCorp Vault | Gestion des secrets (aucun secret en clair dans les repos) |
| GitHub Actions | Pipelines CI/CD réutilisables |
| Prometheus + Grafana + Loki | Métriques et logs centralisés |

## Contenu attendu

```
docker-compose.yml        # postgres, rabbitmq, keycloak, vault (dev)
realm/                    # export du realm Keycloak (rôles acheteur/vendeur/admin)
.github/workflows/        # workflow réutilisable lint-test-scan-build
helm/
  collector-catalog-api/
  collector-moderation-worker/
  collector-frontend/
  ingress/                # Ingress + cert-manager
  monitoring/             # kube-prometheus-stack, Loki/Promtail, dashboards Grafana
```

## Backlog (US concernées)

- **US7** — Déploiement des services sur Minikube via Helm (charts fonctionnels, HTTPS via Ingress)
- **US8** — Centralisation des logs et métriques (dashboard Grafana, logs dans Loki)

## Démarrage local

```bash
cp .env.example .env
docker compose up -d
```

Démarre PostgreSQL, RabbitMQ, Keycloak et Vault en mode développement pour les autres services du projet.

| Service | URL locale | Identifiants (dev) |
|---|---|---|
| PostgreSQL | `localhost:5432` | voir `.env` |
| RabbitMQ (management) | http://localhost:15672 | voir `.env` |
| Keycloak (admin console) | http://localhost:8080 | voir `.env` |
| Vault (dev, non persistant) | http://localhost:8200 | token dans `.env` |

Le realm `collector-shop` (rôles `acheteur`/`vendeur`/`admin`, clients `catalog-api` et `collector-frontend`, utilisateurs de démo) est importé automatiquement au démarrage de Keycloak depuis `realm/collector-shop-realm.json`.

## Pipeline CI/CD réutilisable

`.github/workflows/reusable-lint-test-scan-build.yml` est appelé depuis les workflows des autres repos via `workflow_call` (lint → tests + couverture → `npm audit` → build image Docker → scan Trivy). Il fait échouer la CI si le lint, les tests, l'audit de dépendances ou le scan Trivy détectent un problème au-delà du seuil configuré.

## Déploiement Kubernetes (Minikube)

Prérequis : Docker (2 CPU minimum), `minikube`, `kubectl`, `helm`.

```bash
# 1. Cluster et Ingress
minikube start --driver=docker --cpus=2 --memory=3072
minikube addons enable ingress

# 2. cert-manager et émetteur auto-signé
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm install cert-manager jetstack/cert-manager --version v1.21.2 \
  --namespace cert-manager --create-namespace --set crds.enabled=true --wait
kubectl apply -f k8s/cert-manager/cluster-issuer.yaml

# 3. Dépendances (Postgres persistant, RabbitMQ, Keycloak sur Postgres)
kubectl create configmap keycloak-realm --from-file=realm/collector-shop-realm.json
kubectl apply -f k8s/deps/
```

Les images d'infrastructure (`postgres:16-alpine`, `rabbitmq:3-management-alpine`, `quay.io/keycloak/keycloak:24.0`) et celles de cert-manager et d'ingress-nginx doivent être disponibles dans le cluster. Sur un réseau qui intercepte TLS, les télécharger sur l'hôte puis les charger avec `minikube image load <image:tag>` (sans `@sha256` dans le nom).

### Services

```bash
helm install catalog-api charts/collector-service -f charts/values-catalog-api.yaml
helm install moderation-worker charts/collector-service -f charts/values-moderation-worker.yaml
```

Les images `collector/catalog-api:local` et `collector/moderation-worker:local` doivent être chargées avec `minikube image load`. La base doit être migrée une fois avec Prisma (`DATABASE_URL` pointant sur le Postgres du cluster, via `kubectl port-forward svc/postgres 15432:5432`).

### Accès

Les hôtes `*.localhost` résolvent vers 127.0.0.1 dans Chrome et Firefox, sans modifier `/etc/hosts`. Exposer l'Ingress puis ouvrir les URLs avec le port 8443 :

```bash
kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller 8443:443
```

- API : https://api.localhost:8443/articles?status=published
- Keycloak : https://keycloak.localhost:8443

Le certificat est auto-signé : le navigateur affiche un avertissement à accepter.

### Observabilité (Prometheus, Grafana, Loki)

Prérequis : la VM Docker doit disposer d'au moins 8 Go de RAM (Docker Desktop > Settings > Resources), la stack de supervision ajoute environ 1 Go à la charge du cluster.

```bash
kubectl create namespace monitoring
# Mot de passe Grafana généré localement, jamais versionné
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin --from-literal=admin-password="$(openssl rand -base64 24)"

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts && helm repo update

# Prometheus + Grafana (version épinglée)
helm install kps prometheus-community/kube-prometheus-stack --version 92.9.0 \
  -n monitoring -f charts/monitoring/kube-prometheus-stack-values.yaml --wait

# Logs : Loki (mono-binaire) + Promtail
helm install loki grafana/loki --version 7.3.0 -n monitoring -f charts/monitoring/loki-values.yaml --wait
helm install promtail grafana/promtail --version 6.17.1 -n monitoring -f charts/monitoring/promtail-values.yaml

# Métriques de l'Ingress et dashboard Grafana
kubectl apply -f k8s/monitoring/ingress-nginx-podmonitor.yaml
kubectl -n monitoring create configmap collector-shop-dashboard \
  --from-file=collector-shop.json=charts/monitoring/dashboards/collector-shop.json
kubectl -n monitoring label configmap collector-shop-dashboard grafana_dashboard=1
```

Les images (`quay.io/prometheus/prometheus`, `quay.io/prometheus-operator/*`, `docker.io/grafana/*`, `quay.io/kiwigrid/k8s-sidecar`, `docker.io/kiwigrid/k8s-sidecar`) doivent être chargées avec `minikube image load` comme les autres images.

Accès Grafana : https://grafana.localhost:8443 (après le port-forward de l'Ingress). Le dashboard « Collector.shop - Observabilité » regroupe latence, erreurs 5xx, résultats de modération et logs.

## Documentation liée

Voir le repo [`collector-docs`](https://github.com/LeopoldPetit/collector-docs) pour le plan général, l'architecture détaillée et le backlog complet du projet.
