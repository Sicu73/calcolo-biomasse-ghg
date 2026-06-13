# Calcolo costo biomasse & risparmio GHG — UNI/TS 11567:2024

App web **a file singolo** (HTML/CSS/JS, nessuna dipendenza, funziona offline) per stimare, dato un impianto di biometano e un mix di biomasse, il **costo annuo della materia prima**, il **risparmio di gas serra (GHG)** e la **sostenibilità**, confrontando il calcolo con **valori standard** e con **valori puntuali**.

> 🔗 **Versione online (apri e usa subito):** https://sicu73.github.io/calcolo-biomasse-ghg/

## Cosa fa

- **Impianto**: resa in rete / autoconsumo, comparatore fossile EF (80 «altri usi» / 94 trasporti), target di risparmio, energia di processo (rinnovabile/base), gestione digestato (Dig.A / Dig.C 30 gg / ≥60 gg), upgrading & off-gas (S/C OffG, UpG <1%, UpG <0,2%, C/C OffG).
- **Biomasse**: tabella editabile con libreria a 3 categorie UNI (**coltura energetica**, **effluente zootecnico**, **FORSU**); per ogni matrice imposti resa (Sm³CH₄/t), costo (€/t) e **tonnellate/anno**.
- **Modalità GHG**: interruttore **Standard ↔ Puntuale** (i valori puntuali agiscono solo sui termini propri della biomassa — coltivazione, credito effluente, trasporto — non sull'impianto).
- **Risultati in tempo reale**: risparmio GHG %, badge di sostenibilità (target + soglia di legge 70%), costo biomassa €/anno e €/Sm³, biometano netto, dettaglio per matrice.
- **Confronto Standard ↔ Puntuale**: a parità di target di saving, mostra il **risparmio €/anno** ottenibile con un'analisi GHG puntuale delle sole biomasse.

## Come si usa

1. Apri la [versione online](https://sicu73.github.io/calcolo-biomasse-ghg/), **oppure** scarica `index.html` e aprilo con un doppio clic nel browser.
2. Imposta i parametri d'impianto, le biomasse e le tonnellate.
3. Leggi costo, saving e confronto standard/puntuale (ricalcolo automatico).

Il pulsante **«↺ Caso validato»** ripristina lo scenario di riferimento (impianto 300 Sm³/h, mais + liquame suino).

## Modello

Emissione ponderata sull'energia del mix:

```
E_i = ( ec + credito + (lavorazione + upgrading + penalità 30 gg) ) / 0,9 + etd
E_mix = Σ ( quota_energia_i × E_i )
Risparmio = (EF − E_mix) / EF
```

I valori standard di emissione provengono dalla tabella della **UNI/TS 11567:2024** (configurazioni rinnovabile e base, filiere coltura energetica / effluente zootecnico / FORSU). Il modello è stato verificato riproducendo un foglio di calcolo di riferimento.

## Avvertenza

Strumento di **supporto tecnico**: i valori puntuali sono ipotesi da documentare in perizia e i dati specifici d'impianto vanno sempre verificati. Non sostituisce la certificazione di sostenibilità.

## Licenza

[MIT](LICENSE).
