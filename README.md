# Astra OS — AI Operating System

Astra OS est une première version front-end d’un système d’exploitation pour le travail numérique. L’utilisateur exprime un objectif, le Coordinateur analyse le contexte, construit un plan, délègue aux agents et conserve une validation humaine pour les décisions sensibles.

> **Principe produit :** Idée → Résultat

## Fonctionnalités

- tableau de bord opérationnel avec objectifs, agents, validations, activité et productivité ;
- création guidée d’un objectif en six étapes ;
- plans éditables avec étapes, tâches, risques, confiance, outils et agents ;
- vues détaillées des objectifs et projets ;
- centre d’activité compatible avec une future source WebSocket/SSE ;
- agents activables, permissions, statistiques, outils et journaux ;
- mémoire en graphe et tableau, modifiable et désactivable ;
- constructeur visuel d’automatisations compatible avec une future conversion n8n ;
- connexions simulées et connecteurs API/webhook personnalisés ;
- centre de validations avec autorisation groupée limitée aux faibles risques ;
- matrice de permissions, niveaux d’autonomie et modèles IA ;
- assistant Coordinateur, recherche globale et palette `Ctrl + K` ;
- thème sombre/clair, responsive, toasts et persistance SQLite côté serveur.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict ;
- Tailwind CSS 4 et composants shadcn/ui adaptés au produit ;
- Zustand pour l’état client synchronisé avec SQLite ;
- TanStack Query pour la future couche réseau ;
- React Hook Form + Zod ;
- Recharts, Lucide React et Sonner.

## Installation

Prérequis : Node.js 22.5+ et npm 10+. Le projet utilise l’API SQLite native de Node.js.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Sous Windows PowerShell :

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

Commandes utiles :

```bash
npm run lint
npm run build
npm run start
```

## Variables d’environnement

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_WS_URL=
NEXT_PUBLIC_N8N_WEBHOOK_URL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ASTRA_DB_PATH=./data/astra-os.sqlite
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPER_ADMIN_EMAILS=admin@votre-domaine.fr
SECRETS_ENCRYPTION_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
STRIPE_PRICE_BUSINESS=
```

Les variables `NEXT_PUBLIC_*` sont visibles dans le navigateur. **N’y placez jamais de secret, token privé, clé API fournisseur ou signature de webhook.** Les secrets doivent rester dans des variables serveur sans préfixe public.

## Architecture

```text
src/
  app/                       # routes App Router, loading et error boundary
    activity/
    agents/[id]/
    approvals/
    automations/
    connections/
    goals/[id]/
    goals/new/
    memory/
    projects/[id]/
    settings/
  components/
    activity/                # flux et ActivityLogItem
    agents/                  # listes et détail
    approvals/               # ApprovalCard et centre de validation
    assistant/               # assistant Coordinateur
    automations/             # workflows visuels
    connections/             # intégrations et formulaires sécurisés
    dashboard/               # tableau de bord
    goals/                   # objectifs, wizard et détail
    layout/                  # shell, sidebar, topbar, palette
    memory/                  # graphe et table
    projects/                # portefeuille et détail
    settings/                # autonomie et permissions
    shared/                  # indicateurs, timeline, modal, empty state
    ui/                      # primitives UI de style shadcn
  config/                    # routes, modèles, autonomie, actions sensibles
  lib/                       # utilitaires et accès SQLite serveur
  mocks/                     # jeu d’initialisation de la base
  services/                  # services HTTP et client API
  stores/                    # store Zustand synchronisé avec l’API
  types/                     # types métier TypeScript
```

## Base de données locale

Le scénario central est le projet **« Service d’automatisation PME »**, avec les objectifs, agents, actions, décisions, validations et événements associés.

Les données initiales de `src/mocks/data.ts` servent uniquement à initialiser SQLite lors du premier lancement. Ensuite, l’application lit et écrit dans `data/astra-os.sqlite` via `src/app/api/workspace/route.ts` et `src/lib/server/database.ts`.

Les créations d’objectifs et d’automatisations, les validations, l’état des agents, la mémoire et les connexions sont persistés dans cette base. Pour repartir du jeu initial, arrêtez le serveur puis supprimez `data/astra-os.sqlite`.

Pour déplacer la base, définissez `ASTRA_DB_PATH` avec un chemin accessible uniquement au serveur. Le fichier SQLite est ignoré par Git.

### Supabase en production

En présence de `SUPABASE_URL` et `SUPABASE_SECRET_KEY`, la couche serveur utilise automatiquement Supabase à la place de SQLite. La clé secrète ne doit jamais utiliser le préfixe `NEXT_PUBLIC_`.

1. créer un projet Supabase ;
2. ouvrir le SQL Editor et exécuter `supabase/migrations/202607150001_create_workspace_records.sql` ;
3. récupérer l’URL du projet, la clé publiable `sb_publishable_...` et une clé serveur `sb_secret_...` dans Settings → API Keys ;
4. définir `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY` dans `.env.local` ;
5. relancer `npm run dev` : les données initiales seront insérées automatiquement si la table est vide.

La table active RLS et retire l’accès aux rôles `anon` et `authenticated`. Seules les routes serveur disposant de la clé secrète peuvent lire ou modifier les données.

### Authentification et multi-entreprises

La page `/login` permet de se connecter, de créer un compte par email et mot de passe, ou de continuer directement avec Google. Lors de la première authentification, Astra crée automatiquement :

- un profil lié à `auth.users` ;
- une entreprise dans `workspaces` ;
- une adhésion propriétaire dans `workspace_members` ;
- un jeu de données indépendant dans `workspace_records`.

Les sessions utilisent des cookies HTTP-only. `src/proxy.ts` effectue la redirection optimiste vers `/login`, puis chaque Route Handler revérifie réellement le JWT auprès de Supabase avant d’accéder aux données. Le Proxy n’est donc jamais utilisé comme unique contrôle d’autorisation.

Pour activer **Continuer avec Google** :

1. dans Google Cloud, créez un client OAuth Web destiné à Supabase Auth ;
2. ajoutez comme URI autorisée `https://<project-ref>.supabase.co/auth/v1/callback` ;
3. dans Supabase Authentication → Providers → Google, activez le fournisseur et collez son Client ID et son Client Secret ;
4. dans Supabase Authentication → URL Configuration, définissez le domaine Vercel comme Site URL ;
5. ajoutez `http://localhost:3000/auth/callback` et `https://votre-domaine.vercel.app/auth/callback` aux Redirect URLs.

Dans Providers → Email, choisissez si la confirmation d’email est obligatoire avant la première connexion. Les comptes Google existants retrouvent leur espace sans créer une seconde organisation.

Le cycle de compte inclut la confirmation d’email, le renouvellement automatique de session, la déconnexion, l’oubli de mot de passe et la définition d’un nouveau mot de passe. Configurez `NEXT_PUBLIC_SITE_URL` avec le domaine de production et autorisez précisément `/auth/callback` dans Supabase.

### Supervision

`GET /api/health` vérifie que la base active répond et indique si l’authentification est configurée, sans révéler de secret. Utilisez cette route pour les contrôles de disponibilité Vercel ou un service de monitoring externe.

### Console Super Admin

Les emails déclarés dans `SUPER_ADMIN_EMAILS` peuvent ouvrir `/admin` depuis le menu de profil. Cette console liste toutes les entreprises et permet d’inviter, suspendre, réactiver ou supprimer des comptes, de consulter le journal d’audit et de gérer les URLs et clés API propres à chaque workspace.

Trois niveaux d’accès sont appliqués à la navigation **et** aux Route Handlers :

- `viewer` — lecture des tableaux de bord, objectifs, projets et activités ;
- `operator` — utilisation des agents, de la mémoire, des validations et des automatisations ;
- `admin` — gestion des connexions, modèles, permissions, budgets et paramètres de l’entreprise.

La page `/account` permet à chaque utilisateur de gérer son profil et sa sécurité. Les paramètres d’entreprise sont persistés dans Supabase, les éléments de mémoire actifs contextualisent réellement les agents, et les automatisations peuvent être créées, exécutées, mises en pause, exportées et supprimées.

Les mots de passe Supabase ne sont jamais accessibles. Les clés fournisseurs ne sont jamais renvoyées au navigateur après leur enregistrement : elles sont chiffrées en AES-256-GCM dans `integration_secrets`, seuls leurs quatre derniers caractères sont conservés comme indication et chaque modification crée une entrée dans `audit_logs`.

Générez une clé de chiffrement de 32 octets, puis ajoutez sa valeur base64 à Vercel :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
vercel env add SUPER_ADMIN_EMAILS production
vercel env add SECRETS_ENCRYPTION_KEY production
```

Ne modifiez pas `SECRETS_ENCRYPTION_KEY` sans prévoir une migration de rotation : les anciennes clés deviendraient indéchiffrables.

Les futurs exécuteurs d’agents doivent appeler uniquement `getDecryptedIntegrationSecret()` depuis une route serveur, un worker ou une file de tâches. Cette fonction ne doit jamais être importée dans un composant client ; chaque lecture déchiffrée est inscrite dans le journal d’audit.

## Déployer sur Vercel

Le projet est configuré par `vercel.json` et n’écrit jamais dans SQLite lorsque `VERCEL=1`. Supabase est donc obligatoire pour les déploiements Vercel.

```bash
npm install -g vercel
vercel link
vercel env add SUPABASE_URL production
vercel env add SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SECRET_KEY production
vercel env add OPENAI_API_KEY production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_PRICE_STARTER production
vercel env add STRIPE_PRICE_PRO production
vercel env add STRIPE_PRICE_BUSINESS production
vercel --prod
```

Ajoutez également les variables aux environnements Preview et Development si vous souhaitez les utiliser. Après toute modification d’une variable Vercel, créez un nouveau déploiement.

Pour un déploiement Git automatique, poussez le projet sur GitHub puis importez le dépôt depuis Vercel. Aucun dépôt distant n’est actuellement configuré dans ce dossier.

## Connecter une API externe

Les composants ne doivent pas appeler `fetch` directement. La migration se fait dans `src/services/` :

1. définir `NEXT_PUBLIC_API_URL` ;
2. remplacer l’implémentation de `workspaceService` ou du service concerné par les endpoints distants ;
3. conserver les types de `src/types/index.ts` ou générer les types depuis OpenAPI/GraphQL ;
4. appeler les services avec TanStack Query dans les composants ou des hooks de feature ;
5. conserver les mutations optimistes Zustand déjà reliées à la couche réseau.

Exemple :

```ts
import { apiClient } from "@/services/api-client";
import type { Goal } from "@/types";

export async function listGoals() {
  return (await apiClient<Goal[]>("/goals")).data;
}
```

`apiClient` fournit : URL de base, timeout, token optionnel, headers JSON, erreurs typées et annulation via `AbortSignal`.

### Backend REST

Faire correspondre chaque service à une ressource : `/goals`, `/projects`, `/agents`, `/memory`, `/automations`, `/approvals`, `/connections` et `/activity`.

### GraphQL

Créer `src/services/graphql-client.ts`, conserver les interfaces métier, puis remplacer l’implémentation des services sans modifier les pages.

## Connecter Gmail, Google Calendar et Google Drive

Ces trois connecteurs partagent un vrai flux OAuth 2.0 Google Workspace côté serveur. Le refresh token unifié est chiffré dans `integration_secrets`, isolé par workspace, renouvelable sans intervention, testable depuis l’interface et révoqué lors de la déconnexion. Il n’est jamais envoyé au navigateur ni exposé à un agent.

1. ouvrir [Google Cloud Console](https://console.cloud.google.com/) et créer ou sélectionner un projet ;
2. activer Gmail API, Google Calendar API et Google Drive API ;
3. configurer l’écran de consentement OAuth ;
4. créer un identifiant **OAuth Client ID** de type **Web application** ;
5. ajouter comme URI de redirection locale `http://localhost:3000/api/connections/google/callback` ;
6. ajouter comme URI de production `https://votre-domaine.vercel.app/api/connections/google/callback` ;
7. renseigner `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans `.env.local` et dans Vercel ;
8. définir `GOOGLE_REDIRECT_URI` uniquement si vous voulez imposer explicitement une URL de callback ;
9. redémarrer Next.js puis cliquer sur **Autoriser avec Google** dans `/connections`.

L’autorisation couvre Gmail en lecture, brouillons, classement et envoi, ainsi que Calendar et Drive. Après le premier consentement hors ligne, les agents et automatisations réutilisent le refresh token serveur : il n’est pas nécessaire de reconnecter Google à chaque visite. Après une mise à jour des scopes, cliquez une fois sur **Réautoriser** pour obtenir les nouvelles permissions.

Pendant les tests, ajoutez les adresses Gmail autorisées dans la liste des utilisateurs de test de l’écran de consentement Google. En production, les scopes sensibles Gmail peuvent nécessiter une validation Google.

Les autres cartes ne simulent plus de connexion. Elles restent en état **Configuration requise** jusqu’à l’implémentation de leur propre flux OAuth serveur.

## Connecter n8n

`sendGoalToN8n(goal)` est disponible dans `src/services/index.ts`.

Pour une démonstration locale, définir `NEXT_PUBLIC_N8N_WEBHOOK_URL`. Pour la production, ne pas appeler n8n directement depuis le navigateur :

1. créer une Route Handler `src/app/api/n8n/goals/route.ts` ;
2. stocker l’URL privée et la signature dans `N8N_WEBHOOK_URL` et `N8N_WEBHOOK_SECRET` côté serveur ;
3. authentifier l’utilisateur ;
4. valider le payload avec Zod ;
5. journaliser l’action et ajouter un identifiant d’idempotence ;
6. appeler n8n depuis la Route Handler ;
7. renvoyer uniquement un statut public au navigateur.

Le constructeur d’automatisation expose des nœuds `trigger`, `condition`, `agent`, `action`, `approval` et `result`. Ils peuvent être convertis en JSON n8n par un adaptateur serveur dédié.

## Agents et missions multi-agents

La page `/orchestration` rassemble de 2 à 5 agents pour une mission complexe. Le Coordinateur construit une délégation, les agents produisent leurs résultats puis une synthèse est enregistrée dans l’espace de travail.

Les agents Email, Calendrier et Documents peuvent proposer respectivement la création d’un brouillon, le classement ou l’envoi d’un e-mail Gmail, la création d’un événement Google Calendar ou d’un document Google Drive. L’agent Email peut consulter un aperçu borné des métadonnées utiles de la boîte de réception, mais les contenus externes sont traités comme non fiables. Aucune modification externe n’est exécutée pendant la réflexion : une demande détaillée apparaît d’abord dans `/approvals`, avec les données utilisées et une confirmation explicite.

Les appels d’agent consomment le quota de l’entreprise de manière atomique. Les outils sont validés avec Zod côté serveur et les tokens OAuth restent chiffrés côté Supabase. Les pages d’objectif et de projet permettent de confier une mission directement à un agent : le résultat, la confiance, le modèle et l’éventuelle validation d’outil sont enregistrés sur la ressource concernée.

Chaque automatisation persistante contient désormais un `agentId`, une consigne et un outil optionnel. Une exécution manuelle vérifie que l’agent est actif, que le connecteur requis est autorisé, produit un livrable, puis crée une validation avant toute action Gmail, Calendar ou Drive.

L’activation des agents, les connexions OAuth et les préférences de notifications sont persistées dans Supabase. Le centre de notifications de la barre supérieure agrège les validations, erreurs, exécutions et alertes de quota ; son état lu/non lu est conservé par utilisateur. La navigation mobile utilise un tiroir, des actions tactiles et des vues défilantes pour les paramètres et les tableaux larges.

## Abonnements Stripe

La page `/billing` applique les limites de chaque offre :

- **Free** — assistant, objectifs et mémoire, 50 appels/mois, 10/jour et 3/minute ;
- **Starter (19 €/mois)** — connecteurs, automatisations, 2 agents, 500 appels/mois, 50/jour et 10/minute ;
- **Pro (49 €/mois)** — jusqu’à 5 agents, 2 000 appels/mois, 150/jour et 30/minute ;
- **Business (149 €/mois)** — orchestration multi-agents, administration, 10 agents, 8 000 appels/mois, 500/jour et 60/minute.

1. dans Stripe, créez trois produits récurrents mensuels : Starter, Pro et Business ;
2. copiez leurs identifiants de prix (`price_...`) dans `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` et `STRIPE_PRICE_BUSINESS` ;
3. ajoutez `STRIPE_SECRET_KEY` dans Vercel, sans préfixe `NEXT_PUBLIC_` ;
4. dans Stripe Developers → Webhooks, ajoutez `https://votre-domaine.vercel.app/api/billing/webhook` ;
5. sélectionnez au minimum `checkout.session.completed`, `customer.subscription.updated` et `customer.subscription.deleted` ;
6. copiez le secret de signature (`whsec_...`) dans `STRIPE_WEBHOOK_SECRET` puis redéployez.

Le webhook est exempté du contrôle de session, mais sa signature Stripe est vérifiée avant toute mise à jour de l’abonnement. Sans les variables Stripe, l’offre Free reste disponible et seuls les boutons des prix Stripe manquants sont désactivés.

Après la première connexion, les nouveaux administrateurs passent par `/onboarding/subscription` et choisissent explicitement Free ou une offre payante. Les comptes existants ne sont pas redirigés à nouveau. La page `/account` présente ensuite le plan, la prochaine échéance, les quotas et les factures Stripe. La console `/admin` permet au Super Admin de changer une offre, programmer un retour à Free, annuler une résiliation et réinitialiser le quota API ; chaque action est journalisée.

Les limites mensuelles, quotidiennes et par minute sont contrôlées dans une fonction PostgreSQL atomique. Elles ne dépendent donc pas d’un compteur manipulable dans le navigateur. Le nombre d’agents actifs est également contrôlé côté serveur selon l’offre.

## WebSocket ou SSE

La simulation est encapsulée dans `activityService.subscribe`. Pour une source réelle :

- **WebSocket :** utiliser `NEXT_PUBLIC_WS_URL`, authentifier la connexion avec un jeton court et gérer reconnexion/heartbeat ;
- **SSE :** créer un `EventSource` vers une route authentifiée et convertir les événements vers `ActivityEvent` ;
- conserver le même contrat de désabonnement afin que `ActivityPage` ne change pas.

## Authentification

Ajouter l’authentification dans :

- `src/app/layout.tsx` ou un layout de groupe `(authenticated)` pour la session ;
- `src/middleware.ts` ou `src/proxy.ts` selon la stratégie Next.js retenue ;
- les Route Handlers serveur pour les vérifications d’autorisation ;
- `apiClient` pour injecter un token court si le backend est externe.

Ne jamais utiliser la présence d’un bouton masqué comme contrôle d’autorisation. Les permissions doivent être revérifiées côté serveur.

## Ajouter un agent

1. ajouter sa configuration dans `src/mocks/data.ts` ou dans la table backend `agents` ;
2. ajouter ses permissions typées avec `Permission` ;
3. déclarer ses outils et son modèle ;
4. ajouter son exécuteur côté backend ;
5. journaliser chaque appel d’outil avec un `ToolExecution` ;
6. appliquer la validation obligatoire aux actions sensibles.

L’icône peut être le nom d’une icône Lucide supportée par `DynamicIcon`.

## Ajouter une intégration

1. ajouter la définition `Connection` dans les données/configuration ;
2. créer le flux OAuth côté serveur ;
3. stocker les tokens chiffrés côté backend ;
4. exposer seulement l’état et les permissions au front-end ;
5. ajouter les opérations autorisées au service concerné ;
6. prévoir révocation, rotation, test de connexion et audit.

## Sécurité

- formulaires sensibles validés avec Zod côté client **et à revalider côté serveur** ;
- clés masquées dans l’interface et jamais enregistrées dans le store ;
- validation humaine permanente pour suppression, envoi, publication et achat ;
- aucune utilisation de HTML non sécurisé ;
- toutes les actions importantes ont un contexte, un agent, un modèle, un risque et une confiance ;
- les secrets fournisseurs doivent rester côté serveur ;
- ajouter CSRF, rate limiting, signature des webhooks et idempotence lors du raccord backend.

## Validation technique

La V1 a été validée avec :

- TypeScript strict : `tsc --noEmit` ;
- ESLint : aucune erreur ni avertissement ;
- build Next.js 16.2.10 : 14 routes compilées et prérendues avec succès.

## Étapes backend recommandées

1. authentification et organisations ;
2. PostgreSQL pour projets, objectifs, tâches, décisions et audits ;
3. file de tâches et exécuteurs d’agents ;
4. stockage chiffré des connexions ;
5. WebSocket/SSE pour l’activité ;
6. mémoire vectorielle avec politique de rétention ;
7. webhooks n8n signés ;
8. observabilité, budget, retries et annulation.
