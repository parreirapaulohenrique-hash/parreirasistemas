/**
 * demanda-states.js — Máquina de Estados dos Itens de Demanda
 * ============================================================
 * Define os 19 estados possíveis e as transições válidas.
 * Nenhuma outra parte do código deve mudar o status diretamente
 * sem passar por DemandaStates.transition().
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v1.0.0
 */

const DemandaStates = (() => {

    // ── Definição dos estados ─────────────────────────────────
    const STATES = {
        demanda_recebida:        { label: 'Recebida',            icon: 'inbox',           color: '#6366f1' },
        em_identificacao:        { label: 'Identificando',        icon: 'search',          color: '#f59e0b' },
        identificado:            { label: 'Identificado',         icon: 'check_circle',    color: '#3b82f6' },
        estoque_disponivel:      { label: 'Em Estoque',          icon: 'inventory',       color: '#10b981' },
        estoque_parcial:         { label: 'Estoque Parcial',     icon: 'inventory_2',     color: '#f59e0b' },
        sem_estoque:             { label: 'Sem Estoque',         icon: 'inventory_2',     color: '#ef4444' },
        consulta_outras_filiais: { label: 'Outras Filiais',      icon: 'store',           color: '#8b5cf6' },
        transferencia_possivel:  { label: 'Transferência',       icon: 'swap_horiz',      color: '#06b6d4' },
        encaminhado_compras:     { label: 'Em Compras',          icon: 'shopping_cart',   color: '#8b5cf6' },
        cotacao_fornecedor:      { label: 'Cotando',             icon: 'request_quote',   color: '#f97316' },
        compra_possivel:         { label: 'Compra Possível',     icon: 'local_shipping',  color: '#10b981' },
        proposta_enviada:        { label: 'Proposta Enviada',    icon: 'send',            color: '#06b6d4' },
        aguardando_cliente:      { label: 'Aguardando Cliente',  icon: 'hourglass_empty', color: '#94a3b8' },
        venda_aprovada:          { label: 'Aprovado',            icon: 'thumb_up',        color: '#10b981' },
        venda_parcial:           { label: 'Aprovação Parcial',   icon: 'done_all',        color: '#f59e0b' },
        pedido_criado_erp:       { label: 'Pedido no ERP',       icon: 'receipt_long',    color: '#3b82f6' },
        faturado:                { label: 'Faturado',            icon: 'task_alt',        color: '#10b981' },
        venda_perdida:           { label: 'Venda Perdida',       icon: 'cancel',          color: '#ef4444' },
        cancelado:               { label: 'Cancelado',           icon: 'block',           color: '#6b7280' },
    };

    // ── Transições válidas (de → [lista de destinos possíveis]) ──
    const TRANSITIONS = {
        demanda_recebida:        ['em_identificacao', 'identificado', 'cancelado'],
        em_identificacao:        ['identificado', 'cancelado'],
        identificado:            ['estoque_disponivel', 'estoque_parcial', 'sem_estoque', 'cancelado'],
        estoque_disponivel:      ['proposta_enviada', 'aguardando_cliente', 'cancelado'],
        estoque_parcial:         ['proposta_enviada', 'aguardando_cliente', 'encaminhado_compras', 'cancelado'],
        sem_estoque:             ['consulta_outras_filiais', 'encaminhado_compras', 'venda_perdida', 'cancelado'],
        consulta_outras_filiais: ['transferencia_possivel', 'encaminhado_compras', 'venda_perdida', 'cancelado'],
        transferencia_possivel:  ['proposta_enviada', 'aguardando_cliente', 'encaminhado_compras', 'cancelado'],
        encaminhado_compras:     ['cotacao_fornecedor', 'compra_possivel', 'venda_perdida', 'cancelado'],
        cotacao_fornecedor:      ['compra_possivel', 'venda_perdida', 'cancelado'],
        compra_possivel:         ['proposta_enviada', 'aguardando_cliente', 'venda_perdida', 'cancelado'],
        proposta_enviada:        ['aguardando_cliente', 'venda_aprovada', 'venda_parcial', 'venda_perdida', 'cancelado'],
        aguardando_cliente:      ['venda_aprovada', 'venda_parcial', 'venda_perdida', 'cancelado'],
        venda_aprovada:          ['pedido_criado_erp', 'cancelado'],
        venda_parcial:           ['pedido_criado_erp', 'venda_perdida', 'cancelado'],
        pedido_criado_erp:       ['faturado', 'venda_perdida', 'cancelado'],
        faturado:                [], // terminal
        venda_perdida:           [], // terminal
        cancelado:               [], // terminal
    };

    // ── Motivos de venda perdida (seção 13 do Prompt 2) ──────
    const MOTIVOS_PERDA = [
        { key: 'preco',             label: 'Preço' },
        { key: 'marca',             label: 'Marca / Fabricante' },
        { key: 'condicao_pgto',     label: 'Condição de Pagamento' },
        { key: 'prazo',             label: 'Prazo de Entrega' },
        { key: 'concorrencia',      label: 'Comprou de Outro Fornecedor' },
        { key: 'quantidade',        label: 'Quantidade Insuficiente' },
        { key: 'equivalente',       label: 'Equivalente Não Aceito' },
        { key: 'desistencia',       label: 'Cliente Desistiu' },
        { key: 'atendimento',       label: 'Atendimento' },
        { key: 'sem_resposta',      label: 'Cliente Não Respondeu' },
        { key: 'motivo_desconhecido', label: 'Motivo Desconhecido' },
        { key: 'outro',             label: 'Outro (ver detalhe)' },
    ];

    // ── Tipos de venda perdida (seção 12 do Prompt 2) ────────
    const TIPOS_PERDA = {
        tipo1: 'Produto sem cadastro no ERP — oportunidade encerrada',
        tipo2: 'Produto cadastrado, sem estoque — oportunidade encerrada',
        tipo3: 'Estoque parcial — quantidade não atendida',
        tipo4: 'Produto e estoque disponíveis — cliente não comprou',
    };

    // ── API Pública ───────────────────────────────────────────

    /**
     * Valida se uma transição é permitida.
     */
    function canTransition(from, to) {
        if (!STATES[from]) return { valid: false, reason: `Estado "${from}" não existe.` };
        if (!STATES[to])   return { valid: false, reason: `Estado "${to}" não existe.` };
        const allowed = TRANSITIONS[from] || [];
        if (!allowed.includes(to)) {
            return { valid: false, reason: `"${STATES[from].label}" → "${STATES[to].label}" não é permitido.` };
        }
        return { valid: true };
    }

    /**
     * Executa a transição e retorna o item atualizado com timeline appended.
     * @throws {Error} se transição inválida
     */
    function transition(item, toStatus, { por = 'sistema', obs = '' } = {}) {
        const check = canTransition(item.status, toStatus);
        if (!check.valid) throw new Error(`[DemandaStates] ${check.reason}`);

        const entry = {
            evento: 'status_changed',
            de:     item.status,
            para:   toStatus,
            por,
            em:     new Date().toISOString(),
            obs
        };

        return {
            ...item,
            status:       toStatus,
            atualizadoEm: entry.em,
            timeline:     [...(item.timeline || []), entry]
        };
    }

    /** Retorna a definição (label, icon, color) de um estado. */
    function get(state) {
        return STATES[state] || { label: state, icon: 'help', color: '#6b7280' };
    }

    /** Verifica se é estado terminal. */
    function isTerminal(state) {
        return (TRANSITIONS[state] || []).length === 0;
    }

    /** Retorna os destinos válidos a partir de um estado. */
    function nextStates(state) {
        return (TRANSITIONS[state] || []).map(s => ({ key: s, ...STATES[s] }));
    }

    /** Renderiza dot colorido HTML. */
    function renderDot(state, title = true) {
        const def = get(state);
        return `<span class="item-status-dot" style="background:${def.color}" ${title ? `title="${def.label}"` : ''}></span>`;
    }

    /** Renderiza badge texto colorido HTML. */
    function renderBadge(state) {
        const def = get(state);
        return `<span class="badge" style="background:${def.color}22;color:${def.color}">
                    <span class="material-icons-round" style="font-size:0.7rem;vertical-align:middle">${def.icon}</span>
                    ${def.label}
                </span>`;
    }

    return {
        canTransition, transition, get, isTerminal, nextStates,
        renderDot, renderBadge,
        STATES, TRANSITIONS, MOTIVOS_PERDA, TIPOS_PERDA
    };

})();

if (typeof window !== 'undefined') window.DemandaStates = DemandaStates;
