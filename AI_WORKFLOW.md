# Workflow multi-agente

Questo repo puo essere lavorato con Codex, Claude Code, Google Antigravity e Google AI Studio/Antigravity Agent. L'obiettivo e farli collaborare senza sovrascrivere lavoro, produrre modifiche non verificate o creare loop agentici.

## Fonti di istruzioni

- `AGENTS.md`: istruzioni per Codex, Google Antigravity e Google AI Studio.
- `CLAUDE.md`: istruzioni per Claude Code.
- `.agents/skills/`: skill per Codex e strumenti compatibili con Agent Skills.
- `.claude/skills/`: skill per Claude Code.
- Questo file: protocollo operativo comune.


## Punto di ingresso flessibile

Non esiste un orchestratore fisso. Puoi partire da Codex o da Claude Code:

- Se la richiesta parte da **Codex**, Codex diventa orchestratore temporaneo e puo chiamare Claude Code via MCP per review, confronto o analisi ampia.
- Se la richiesta parte da **Claude Code**, Claude diventa orchestratore temporaneo e puo chiamare Codex via MCP per patch mirate, verifica o controllo tecnico.
- L'orchestratore temporaneo decide quando coinvolgere altri agenti, ma deve mantenere un solo writer alla volta.
- Ogni passaggio tra agenti deve avere un obiettivo concreto, input chiari e risultato verificabile.
- Alla fine risponde all'utente l'agente da cui e partita la richiesta, includendo modifiche, verifiche e rischi aperti.
## Ruoli consigliati

- **Codex**: patch mirate, test, verifica finale, review tecnica.
- **Claude Code**: analisi ampia, refactor ragionati, debugging esplorativo, review architetturale.
- **Google Antigravity**: task agentici con editor, terminale e browser; utile per workflow end-to-end e verifiche visuali.
- **Google AI Studio / Antigravity Agent**: prototipi Gemini, esperimenti in sandbox e prove API; non deve essere il primo writer sul repo locale.

## Regole di coordinamento

1. Un solo writer alla volta sul ramo attivo.
2. Se piu agenti lavorano insieme, usare branch o worktree separati.
3. Prima di modificare: sincronizzare con `git pull --rebase origin main`.
4. Prima di pubblicare: `git fetch origin`, `git rebase origin/main`, verifiche, poi push.
5. Mai force-push su `main`.
6. Ogni agente deve lasciare un handoff quando interrompe o passa il lavoro.

## Handoff minimo

I campi in italiano e in inglese sono equivalenti; conta che il contenuto sia completo e verificabile.

```text
Obiettivo:
Branch/worktree:
File modificati:
Comandi eseguiti:
Verifiche:
Decisioni prese:
Rischi o dubbi:
Prossimo passo richiesto:
```

## Ponte MCP locale

Su questa macchina le CLI risultano disponibili:

- `codex-cli 0.133.0`
- `Claude Code 2.1.186`
- `antigravity 1.0.10`

Comandi verificati dalle rispettive CLI:

```powershell
# Codex vede Claude Code come server MCP stdio
codex mcp add claude-code -- claude mcp serve

# Claude Code vede Codex come server MCP stdio, a livello progetto
claude mcp add --scope project codex -- codex mcp-server
```

Per documentazione Gemini aggiornata si puo aggiungere il server MCP pubblico:

```powershell
codex mcp add gemini-docs --url https://gemini-api-docs-mcp.dev
claude mcp add --scope project --transport http gemini-docs https://gemini-api-docs-mcp.dev
```

Nota: Antigravity/AI Studio possono usare istruzioni `AGENTS.md` e skill; per MCP remoto serve un server HTTP/streamable HTTP. I server stdio locali come `codex mcp-server` e `claude mcp serve` non sono automaticamente accessibili da AI Studio cloud senza un bridge esplicito.

## Sicurezza

- Non dare a due agenti permessi di scrittura simultanei sullo stesso file.
- Non lasciare agenti in loop automatico tra loro.
- Non versionare token, header di autenticazione o file di configurazione con segreti.
- Le operazioni distruttive richiedono conferma umana.
- Ogni modifica va verificata con i comandi indicati in `AGENTS.md`.
