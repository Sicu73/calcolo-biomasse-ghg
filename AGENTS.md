# calcolo-biomasse-ghg — repository condiviso

Questo repo è sviluppato **in parallelo da due agenti**: Codex e Claude Code.
Entrambi pubblicano sullo stesso ramo `main`. Per non sovrascrivervi a vicenda,
seguite SEMPRE il protocollo qui sotto.

## Protocollo Git (obbligatorio)

1. **Prima di iniziare a lavorare**: `git pull --rebase origin main`.
2. Fai **commit piccoli e mirati** (una modifica logica per commit).
3. **Prima di ogni push**: `git fetch origin`, poi `git rebase origin/main`,
   risolvi gli eventuali conflitti, quindi `git push origin main`.
4. **Mai** `git push --force` / `--force-with-lease` su `main`.
5. Se un conflitto tocca codice modificato di recente dall'altro agente,
   **integra entrambe le modifiche** — non scartare il lavoro altrui.
6. Pusha spesso: meno divergenza = meno conflitti.
7. Messaggio di commit breve e descrittivo, coerente con lo storico del repo.

## Verifica prima del push

- `node --check ghg-puntuali/app.js` (sintassi).
- Controlla che l'app si carichi: il catalogo matrici si popola e il calcolo
  gira (caricando `ghg-puntuali/index.html`).
- Non pubblicare se la verifica fallisce.

## Fatti del progetto

- Sito **statico** servito da **GitHub Pages dal ramo `main`**: ogni push su
  `main` aggiorna il sito live. Nessuna build, nessuna CI.
- App in `ghg-puntuali/` (`index.html`, `app.js`, `styles.css`,
  `data/uni11567-derived.js`); la root `index.html` è il simulatore economico.
- Il file dati `ghg-puntuali/data/uni11567-derived.js` è grande (~443 KB):
  `python -m http.server` a volte non ne serve il corpo → per la preview locale
  usa un server multi-thread, oppure verifica direttamente su GitHub Pages.
- Modello di calcolo: confronto **lato fornitura** (ec + etd + credito) del
  profilo puntuale contro la riga standard UNI; `ep` (processo/upgrading) è
  escluso dal confronto perché compete all'impianto, non al fornitore.
