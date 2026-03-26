# Import de donnees externes

Ce projet permet d importer des donnees vers MongoDB depuis des fichiers externes en `.json` ou `.csv`.

## Commande

```bash
npm run import:data -- --file <chemin-fichier> --collection <nom-collection> [--mode insert|upsert] [--upsert-by <champ>]
```

## Formats supportes

- `.json` : objet unique ou tableau d objets
- `.csv` : premiere ligne = en-tetes

## Exemples

```bash
npm run import:data -- --file ./uploads/agences.json --collection agences
npm run import:data -- --file ./uploads/produits.csv --collection produits --mode upsert --upsert-by code
```

## Notes

- En mode `insert`, chaque ligne est inseree telle quelle.
- En mode `upsert`, chaque ligne est creee ou mise a jour selon la cle `--upsert-by`.
- Les champs `createdAt` et `updatedAt` sont ajoutes automatiquement s ils sont absents.
