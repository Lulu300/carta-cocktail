---
id: F-12
title: "Requêtes publiques en mode offlineFirst quand le réseau tombe pendant la visite"
phase: F
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [F-02]
touches: [frontend/src/queries/public.ts, frontend/src/queries/public.test.tsx]
sources: []
branch:
pr:
---

## Contexte

F-02 ajoute un service worker : la carte, les fiches cocktail déjà vues et leurs photos se rouvrent sans réseau. Le test de F-02 recharge la page hors ligne, et tout s'affiche. Un cas reste à couvrir : le réseau tombe pendant que l'invité consulte la carte.

## Problème constaté

- TanStack Query suit l'état du réseau avec les événements `online` et `offline` de `window` (`onlineManager`). Les requêtes publiques gardent le `networkMode: 'online'` par défaut (`frontend/src/queries/public.ts`) : après un événement `offline`, une requête qui n'est pas déjà en mémoire ne part pas et reste en pause.
- Exemple : l'invité a vu une fiche cocktail lors d'une visite précédente (réponse gardée par le service worker), recharge la carte, puis perd le réseau. En ouvrant cette fiche, il voit le squelette de chargement jusqu'au retour du réseau, alors que le service worker a la réponse.
- Au chargement d'une page hors ligne, aucun événement `offline` n'a lieu : `onlineManager` part de « en ligne », la requête part et le service worker répond. Ce cas fonctionne déjà.

## Ce qu'il faut faire

1. Passer les trois requêtes publiques (`usePublicMenus`, `usePublicMenu`, `usePublicCocktail`) en `networkMode: 'offlineFirst'` : la requête part une fois, le service worker répond depuis son cache ; sans réponse en cache, l'erreur s'affiche avec « Réessayer » au lieu d'un chargement sans fin.
2. Ne pas changer les requêtes de l'admin, que le service worker ne garde jamais.

## Critères d'acceptation

- [ ] Après un événement `offline`, une fiche cocktail gardée par le service worker s'affiche.
- [ ] Une fiche jamais vue affiche l'état d'erreur public, pas le squelette.
- [ ] Les requêtes de l'admin gardent le mode par défaut.

## Tests à ajouter ou adapter

- `frontend/src/queries/public.test.tsx` : avec `onlineManager.setOnline(false)`, la requête publique part quand même (MSW répond), et une erreur réseau donne l'état d'erreur.

## Points d'attention

- Vérifier dans un navigateur avec le service worker de F-02 (Chrome DevTools > Network > Offline après le chargement de la carte), F-04 pourra l'ajouter au parcours hors ligne.

## Journal

- 2026-11-26 : tâche créée pendant F-02.
