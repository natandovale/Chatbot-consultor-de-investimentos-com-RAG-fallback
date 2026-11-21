---
name: frontend-design
description: Use ao criar ou estilizar componentes Angular em apps/web. Traduz o protótipo visual (sample_ui/Chat Consultor de Investimentos.html) em tokens CSS de cor, tipografia e forma, e define as regras de implementação Angular para bolha de mensagem, citação, painel do pipeline, disclaimer regulatório e botão de envio.
---

# Design System e Padrões Visuais (Angular — AI Researcher)

Esta skill traduz fielmente o protótipo de referência em `sample_ui/Chat Consultor de Investimentos.html` em tokens de design e regras de componentes para o frontend Angular (`apps/web`).

Combine esta skill com:
- **`angular-developer`** (skill oficial) para APIs modernas do Angular (standalone components, signals, control flow `@for`/`@if`, acessibilidade).
- **`angular-component`** (skill do projeto) para arquitetura de stores, consumo de SSE e separação entre UI e HTTP.

---

## 1. Tokens de Cor, Tipografia e Forma (CSS Custom Properties)

Declare os tokens globais em `apps/web/src/styles.scss` (em `:root`) e utilize-os nos estilos dos componentes. Nunca espalhe hexadecimais mágicos fora das variáveis sem necessidade.

```scss
:root {
  /* Superfícies (Dark Mode) */
  --bg-page: #111827;
  --bg-page-glow: radial-gradient(
    circle at 8% 0%,
    rgba(147, 51, 234, 0.16),
    rgba(17, 24, 39, 0) 45%
  );
  --bg-surface: #151e2f;         /* Cards principais: main chat, painel pipeline, painel fonte */
  --bg-elevated: #1f2937;        /* Bolha do assistente, avatar do assistente */
  --bg-step-active: #1c1530;     /* Etapa do pipeline em execução */
  --bg-cite-hover: #2e1a47;      /* Hover do chip de citação */

  /* Cores de Destaque (Roxo Institucional) */
  --accent: #a855f7;             /* Marca, borda de etapa ativa, avatar border, cursor */
  --accent-deep: #9333ea;        /* Bolha do usuário, botão de envio, check concluído, borda card fonte */
  --accent-hover: #7e22ce;       /* Hover do botão de envio */
  --accent-border-subtle: #6b21a8; /* Borda do chip de citação */
  --accent-text: #c084fc;        /* Links, chip de citação, status "Concluído" */
  --accent-text-bright: #e9d5ff; /* Hover de link, status "Em execução" */

  /* Texto */
  --text-primary: #ffffff;       /* Títulos, bolha do usuário, texto do input */
  --text-body: #e5e7eb;          /* Texto da resposta do assistente, valores <dd> de fonte */
  --text-muted: #9ca3af;         /* Subtítulos, labels <dt>, etapas pendentes, disclaimer */

  /* Bordas */
  --border-subtle: #1f2937;      /* Borda de cards, header, divisórias, etapa concluída */
  --border-control: #374151;     /* Borda da caixa de input, etapa pendente (dashed), divisor header */
  --border-pending-dot: #4b5563; /* Círculo de etapa pendente */

  /* Tipografia */
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Forma (Border Radius) */
  --radius-card: 16px;
  --radius-input-box: 14px;
  --radius-step: 12px;
  --radius-send-btn: 10px;
  --radius-pill: 999px;
  --radius-bubble-user: 18px 18px 4px 18px;
  --radius-bubble-assistant: 4px 18px 18px 18px;
}
```

### Escala Tipográfica e Fontes

- Carregue **Inter** (`400`, `500`, `600`, `700`) e **JetBrains Mono** (`400`, `500`) no `apps/web/src/index.html`.
- **Uso obrigatório de `var(--font-mono)`**:
  - Campo **Data-base / Período** no detalhe da fonte (ex.: `3T25 · 2025-09-30`).
  - URLs / links para o **Documento original** (`font-size: 13px; word-break: break-all`).
  - Durações em milissegundos ou contadores técnicos de iteração no painel do pipeline.
- **Tamanhos de fonte do protótipo**:
  - Marca no header (`Investments`): `20px`, `font-weight: 700`, `color: var(--accent)`.
  - Títulos de painel (`h2` — `Raciocínio`, `Fonte [1]`): `16px`, `font-weight: 600`, `color: var(--text-primary)`.
  - Prosa de mensagem e campo de `input`: `16px` (`line-height: 1.55` na bolha do usuário; `line-height: 1.65` na bolha do assistente).
  - Subtítulos, chips de citação e `<dl>` de fonte: `14px`.
  - Status de etapa no pipeline (`Concluído`, `Em execução`, `Pendente`) e link monoespaçado: `13px`.

### Layout Responsivo da Página

- **Shell da página**: `min-height: 100vh; background-color: var(--bg-page); background-image: var(--bg-page-glow); color: var(--text-primary); font-family: var(--font-sans); display: flex; flex-direction: column`.
- **Header**: `display: flex; align-items: center; justify-content: space-between; padding: 20px 32px; border-bottom: 1px solid var(--border-subtle); gap: 16px; flex-wrap: wrap`.
  - Esquerda: ícone SVG da marca (`28x28px`, `stroke: var(--accent)`) + título `Investments` + subtítulo `Consultor de Investimentos` (`padding-left: 12px; border-left: 1px solid var(--border-control); color: var(--text-muted); font-size: 14px`).
- **Grid de conteúdo**: `flex: 1; display: flex; flex-wrap: wrap; gap: 24px; padding: 24px 32px 32px`.
  - **Coluna de Chat (`<main>`)**: `flex: 1 1 560px; min-width: 0; display: flex; flex-direction: column; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: hidden`.
  - **Coluna Lateral (`<aside>`)**: `flex: 0 1 360px; min-width: 280px; display: flex; flex-direction: column; gap: 24px`.

---

## 2. Regras de Componentes Angular

### 2.1. Bolha de Mensagem (`MessageBubble`)

1. **Lista de mensagens**: container flex vertical com `padding: 32px; gap: 28px; overflow-y: auto`.
2. **Mensagem do Usuário**:
   - `align-self: flex-end; max-width: 78%`.
   - `background: var(--accent-deep); color: var(--text-primary); padding: 14px 18px; border-radius: var(--radius-bubble-user); font-size: 16px; line-height: 1.55`.
3. **Mensagem do Assistente**:
   - `align-self: flex-start; max-width: 88%; display: flex; gap: 14px`.
   - **Avatar circular à esquerda**: `flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--bg-elevated); border: 1px solid var(--accent); display: flex; align-items: center; justify-content: center` com ícone SVG `18x18px` (`stroke: var(--accent)`, `aria-hidden="true"`).
   - **Coluna de conteúdo**: `display: flex; flex-direction: column; gap: 14px; min-width: 0`.
   - **Bolha**: `background: var(--bg-elevated); color: var(--text-body); padding: 16px 20px; border-radius: var(--radius-bubble-assistant); font-size: 16px; line-height: 1.65`.
4. **Cursor de Streaming (`.cs-cursor`)**:
   - Renderizado com `@if (message.isStreaming)` ao final do texto da bolha do assistente:
     ```scss
     @keyframes cs-blink {
       0%, 49% { opacity: 1; }
       50%, 100% { opacity: 0; }
     }
     .cs-cursor {
       display: inline-block;
       width: 2px;
       height: 1.1em;
       background: var(--accent);
       vertical-align: text-bottom;
       margin-left: 2px;
       animation: cs-blink 1s steps(1) infinite;
     }
     ```
   - Sempre marque o cursor com `aria-hidden="true"`.

### 2.2. Citação (Chip `.cs-cite` e Card Lateral de Fonte)

1. **Chips de citação abaixo da bolha do assistente**:
   - Cada fonte retornada no evento `retrieve` / `answer` gera um `<button type="button" class="cs-cite">` clicável.
   - Estilo obrigatório do chip:
     - `align-self: flex-start; display: inline-flex; align-items: center; gap: 8px`
     - `background: transparent; color: var(--accent-text); border: 1px solid var(--accent-border-subtle); border-radius: var(--radius-pill)`
     - `padding: 8px 14px; min-height: 44px; font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer`
     - Hover (`.cs-cite:hover`, `.cs-cite:focus-visible`): `background: var(--bg-cite-hover)`.
   - Conteúdo do chip: ícone SVG de documento (`16x16px`, `aria-hidden="true"`) + rótulo `[{{ index + 1 }}] {{ source.title }}` (incluindo ticker e trimestre quando vier do corpus CVM, ex.: `[1] Vale S.A. (VALE3) · 3T25`).
   - Acessibilidade: `aria-label="Abrir fonte: {{ source.title }}"` e `[attr.aria-pressed]="selectedSource()?.id === source.id"`.
2. **Card Lateral de Detalhe da Fonte (`<section>` no `<aside>`)**:
   - Exibido quando há uma fonte selecionada no store (`@if (store.selectedSource(); as source)`).
   - Container: `background: var(--bg-surface); border: 1px solid var(--accent-deep); border-radius: var(--radius-card); padding: 24px`.
   - Header do card: título `h2` (`Fonte [{{ source.index }}]`, `16px`, `font-weight: 600`) + botão de fechar (`width: 44px; height: 44px; background: transparent; border: 0; color: var(--text-muted); cursor: pointer`, `aria-label="Fechar painel de fonte"`).
   - Lista de metadados (`<dl style="display: flex; flex-direction: column; gap: 14px; font-size: 14px; margin: 0">`):
     - **Data-base**: `<dt>` em `var(--text-muted)` e `<dd>` em `font-family: var(--font-mono); color: var(--text-body)` exibindo período e data-base (ex.: `3T25 (2025-09-30)`).
     - **Origem**: `<dt>` em `var(--text-muted)` e `<dd>` em `color: var(--text-body)` exibindo instituição/documento (`CVM — Demonstrações Financeiras Padronizadas` ou título web).
     - **Documento original**: `<dt>` em `var(--text-muted)` e `<dd>` contendo `<a class="cs-link" [href]="source.sourceUrl" target="_blank" rel="noopener noreferrer">` em `font-family: var(--font-mono); font-size: 13px; color: var(--accent-text); word-break: break-all` (hover `color: var(--accent-text-bright)`).

### 2.3. Painel do Pipeline (`<section>` "Raciocínio")

1. **Container no `<aside>`**:
   - `background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); padding: 24px`.
   - Título `h2`: `Raciocínio` (`margin: 0 0 4px; font-size: 16px; font-weight: 600`).
   - Subtítulo `p`: `Pipeline em 4 etapas` (`margin: 0 0 20px; font-size: 14px; color: var(--text-muted)`).
2. **Lista de etapas (`<ol>`)**:
   - `list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px`.
   - Mapeia os eventos SSE reais do grafo (`retrieve` → `Retrieve`, `grade` → `Grade`, `webSearch` → `Search`, `answer` → `Answer`).
   - **Regra pedagógica (da skill `angular-component`)**: não esconda o loop quando o grafo fizer fallback (`retrieve → grade → webSearch → retrieve → grade → answer`); reflita a transição em tempo real e exiba a duração/status de cada etapa.
3. **Três estados visuais obrigatórios para cada `<li>` (`display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--radius-step)`)**:
   - **Concluído (`status === 'completed'`)**:
     - Item: `border: 1px solid var(--border-subtle)`.
     - Indicador `28x28px`: `border-radius: 50%; background: var(--accent-deep); display: flex; align-items: center; justify-content: center` com ícone SVG de check branco (`width="14" height="14" stroke="#fff" stroke-width="3"`).
     - Nome da etapa: `flex: 1; font-weight: 600; color: var(--text-primary)`.
     - Status à direita: `font-size: 13px; color: var(--accent-text)` (`Concluído`, podendo incluir duração em `var(--font-mono)`).
   - **Em execução (`status === 'running'`)**:
     - Item: `border: 1px solid var(--accent); background: var(--bg-step-active)`.
     - Indicador `28x28px` (`.cs-run`): `border-radius: 50%; border: 2px solid var(--accent); box-sizing: border-box; display: flex; align-items: center; justify-content: center` contendo um ponto interno `8x8px` (`border-radius: 50%; background: var(--accent)`) e animação pulsante:
       ```scss
       @keyframes cs-pulse {
         0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.55); }
         50% { box-shadow: 0 0 0 6px rgba(168, 85, 247, 0); }
       }
       .cs-run {
         animation: cs-pulse 1.6s ease-in-out infinite;
       }
       ```
     - Nome da etapa: `flex: 1; font-weight: 600; color: var(--text-primary)`.
     - Status à direita: `font-size: 13px; color: var(--accent-text-bright)` (`Em execução`).
   - **Pendente (`status === 'pending'`)**:
     - Item: `border: 1px dashed var(--border-control)`.
     - Indicador `28x28px`: `border-radius: 50%; border: 2px solid var(--border-pending-dot); box-sizing: border-box`.
     - Nome da etapa: `flex: 1; font-weight: 600; color: var(--text-muted)`.
     - Status à direita: `font-size: 13px; color: var(--text-muted)` (`Pendente`).

### 2.4. Disclaimer Regulatório Permanente

1. **Visibilidade incondicional**:
   - Exigência regulatória (CVM): o disclaimer nunca pode ser um modal, toast temporário ou banner com botão de fechar, e não pode sumir durante o streaming.
2. **Posicionamento e Estilo**:
   - Deve ficar permanentemente visível no rodapé do card principal `<main>` (logo abaixo da caixa de input) ou como barra fixa no layout principal.
   - Estilo harmônico com o `sample_ui`:
     - `font-size: 12px` a `13px`, `line-height: 1.4`, `color: var(--text-muted)`.
     - Texto claro afirmando que o assistente tem caráter exclusivamente informativo e educacional com base em dados públicos da CVM (ITR/DFP) e não constitui recomendação ou consultoria de investimento.

### 2.5. Barra de Input e Botão de Envio (`.cs-send`)

1. **Área de rodapé do `<main>`**:
   - `padding: 16px 32px 24px; border-top: 1px solid var(--border-subtle)`.
2. **Caixa do formulário**:
   - `display: flex; align-items: center; gap: 12px; background: var(--bg-page); border: 1px solid var(--border-control); border-radius: var(--radius-input-box); padding: 8px 8px 8px 20px`.
   - Ao receber foco (`:focus-within`): `border-color: var(--accent)`.
3. **Campo de texto (`<input>`)**:
   - Sempre acompanhado de `<label for="msg" class="sr-only">Mensagem</label>` (visualmente oculto, acessível a leitores de tela).
   - `placeholder="Pergunte sobre seus investimentos…"`.
   - `flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; color: var(--text-primary); font-family: inherit; font-size: 16px; min-height: 44px`.
4. **Botão de Envio (`.cs-send`)**:
   - `<button class="cs-send" type="submit" aria-label="Enviar mensagem" [disabled]="isSendDisabled()">`.
   - Dimensões e forma: `flex: none; width: 48px; height: 48px; border-radius: var(--radius-send-btn); border: 0`.
   - Cores: `background: var(--accent-deep); color: var(--text-primary); display: flex; align-items: center; justify-content: center; cursor: pointer`.
   - Hover (`.cs-send:hover:not(:disabled)`): `background: var(--accent-hover)`.
   - Desabilitado (`.cs-send:disabled`): `opacity: 0.5; cursor: not-allowed` (desabilitado quando o input está em branco ou enquanto uma resposta SSE está em andamento).
   - Ícone interno: SVG de seta para a direita (`width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` com `<path d="M5 12h14"/>` e `<path d="M13 6l6 6-6 6"/>`, `aria-hidden="true"`).
