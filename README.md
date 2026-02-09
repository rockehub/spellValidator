# Spell Validator

Aplicação web para validar todas as combinações possíveis de feitiços com base no Excel do sistema.

## O que faz

- Lê as abas principais do Excel:
  - `DT_ElementDefinitions`
  - `DT_OffensivePhenomena`
  - `DT_ProtectivePhenomena`
  - `DT_UtilityPhenomena`
- Gera **todas as combinações possíveis** dos elementos (2^N - 1).
- Valida ativação de fenômenos por combinação.
- Detecta conflitos (empate de maior prioridade na mesma categoria).
- Lista fenômenos inacessíveis (nunca ativados por nenhuma combinação).
- Exibe todos os dados do Excel em UI clara (tabelas e filtros).

## Executar

```bash
python app.py --xlsx "SpellSystem_v2_ConflictFree (1).xlsx"
```

Depois abra `http://localhost:8000`.

## Gerar apenas relatório JSON

```bash
python app.py --build-only --xlsx "SpellSystem_v2_ConflictFree (1).xlsx"
```
