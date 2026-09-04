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
docker compose up -d
```

Démarre PostgreSQL, RabbitMQ, Keycloak et Vault en mode développement pour les autres services du projet.

## Déploiement Kubernetes (Minikube)

```bash
minikube start
helm install collector-catalog-api ./helm/collector-catalog-api
helm install collector-moderation-worker ./helm/collector-moderation-worker
helm install collector-frontend ./helm/collector-frontend
```

## Documentation liée

Voir le repo [`collector-docs`](https://github.com/LeopoldPetit/collector-docs) pour le plan général, l'architecture détaillée et le backlog complet du projet.
