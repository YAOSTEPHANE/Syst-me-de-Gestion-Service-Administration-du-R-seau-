# Sauvegarde des donnees

Ce projet fournit maintenant un mecanisme de sauvegarde/restauration applicatif
base sur des scripts Node.js.

## Perimetre sauvegarde

- Toutes les collections MongoDB de la base active.
- Le dossier `uploads` (s il existe).
- Un fichier `manifest.json` avec les metadonnees de sauvegarde.

## Variables d environnement

Optionnelles (voir `.env.example`) :

- `BACKUP_DIR` : dossier racine des sauvegardes (defaut: `backups`).
- `BACKUP_RETENTION_DAYS` : retention en jours (defaut: `14`).

## Sauvegarder

```bash
npm run backup:data
```

Resultat:

- Creation d un dossier `backup-YYYYMMDD-HHMMSS` dans `BACKUP_DIR`.
- Fichiers `mongo/*.ndjson.gz` (un par collection).
- Copie du dossier `uploads` si present.
- Purge automatique des sauvegardes trop anciennes selon la retention.

## Restaurer

Restauration complete avec purge prealable des collections:

```bash
npm run restore:data -- --from=backups/backup-YYYYMMDD-HHMMSS --drop
```

Restaurer aussi les fichiers `uploads`:

```bash
npm run restore:data -- --from=backups/backup-YYYYMMDD-HHMMSS --drop --restore-uploads
```

## Bonnes pratiques

- Lancer les sauvegardes via une tache planifiee (cron / scheduler CI).
- Tester regulierement la restauration sur un environnement non production.
- Conserver au moins une copie hors serveur principal (stockage externe).
- Restreindre strictement les acces aux dossiers de sauvegarde.

## Planification automatique (Windows)

Le projet inclut un script PowerShell pour creer la tache planifiee quotidienne.

Commande rapide (heure par defaut: `02:00`) :

```bash
npm run backup:task:windows
```

Commande personnalisee (nom + heure) :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register-backup-task.ps1 -TaskName "LONACI-Backup-Prod" -BackupTime "01:30"
```

Notes:

- Le log d execution est ecrit dans `backups/scheduler.log`.
- La commande est relancee chaque jour avec `npm run backup:data`.
