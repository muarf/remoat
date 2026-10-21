# TODO & Roadmap — Remoat

## En cours : Fix False Positives & Flood dans ApprovalDetector (Branch: `fix/approval-detector-false-positives`)

- [x] Identifier la cause racine du spam « 🔔 Approval Required » (faux positif `.includes('run')` sur les commandes du type `gh run`, `npm run`, et variations de libellés d'état `Running...` / `Ran...`)
- [x] Mettre à jour `src/services/approvalDetector.ts` :
  - [x] Exclure formellement les boutons de statut d'exécution (`Ran *`, `Running *`).
  - [x] Remplacer le matching par sous-chaîne (`.includes('run')`) par un matching de libellé strict ou verbe d'action isolé (`^run$`, `^execute$`, etc.) pour ne pas matcher des commandes comme `gh run`, `npm run`, `cargo run`.
  - [x] S'assurer que le conteneur ciblé est bien un dialogue d'autorisation actif et non un widget d'historique de chat (suppression du fallback `document.body`).
  - [x] Nettoyer la clé de déduplication pour éviter les boucles en cas de texte dynamique.
- [x] Ajouter une protection cooldown anti-flood (2.5s) dans `src/services/cdpBridgeManager.ts`.
- [x] Ajouter des tests unitaires dans `tests/services/approvalDetector.dom.test.ts` pour couvrir :
  - [x] Ignorer `Ran gh run view...`
  - [x] Ignorer `Running 7 commands`
  - [x] Ignorer `npm run build` et `cargo run --release`
  - [x] Conserver la détection des vraies approbations (`Allow Once`, `Allow this conversation`, `Deny`, `Run` bouton d'approbation).
- [x] Valider avec `npm test` (79 test suites, 907 tests passés) et `npm run build` (tsc 0 erreur).
- [ ] Déployer le nouveau build sur la session `screen` en local.
- [ ] Commiter sur la branche `fix/approval-detector-false-positives`.

---

## Roadmap / Améliorations futures

- [ ] **Détection de fin de réponse autonome (Antigravity System Events)** :
  - Écouter l'indicateur d'activité global d'Antigravity (`Thinking...`) pour attacher automatiquement un `ResponseMonitor` lorsque l'agent reprend de façon autonome (fin d'une tâche de fond, notification système, timer).
- [ ] **Commandes avancées** :
  - [ ] Commande `/plan` dans Telegram pour déclencher le mode planification / génération de plan structuré.
  - [ ] Commande `/grill-me` pour cadrage interactif des exigences.
