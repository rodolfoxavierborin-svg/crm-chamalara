// File: src/utils/kanbanUtils.ts

import { parseDataSegura, toDateStrSP } from './dateUtils';

export { parseDataSegura, toDateStrSP };

export const COLUNAS = [
  { id: 'novo', titulo: 'Novos Pacientes', dot: 'bg-blue-500' },
  { id: 'nao_respondeu', titulo: 'Não Respondeu', dot: 'bg-amber-500' },
  { id: 'agendado', titulo: 'Agendados (Lara)', dot: 'bg-indigo-500' },
  { id: 'agendado_clinica', titulo: 'Agendados (Clínica)', dot: 'bg-emerald-500' },
  { id: 'confirmado', titulo: 'Confirmados', dot: 'bg-emerald-600' },
  { id: 'no_show', titulo: 'Faltou (No-Show)', dot: 'bg-red-500' },
  { id: 'na_clinica', titulo: 'Na Clínica', dot: 'bg-amber-500' },
  { id: 'vendido', titulo: 'Tratamento Fechado', dot: 'bg-teal-500' },
  { id: 'nao_vendido', titulo: 'Tratamento Não Fechado', dot: 'bg-rose-500' },
  { id: 'encerrado', titulo: 'Encerrados', dot: 'bg-slate-400' },
];

export const LISTA_UNIDADES = ['Santo André', 'Diadema', 'Mauá', 'São Mateus'];

export const getTempoCronologicoKanban = (lead: any) => {
  const statusNorm = (lead?.status || '').toLowerCase().trim();
  if (statusNorm === 'vendido') {
    const timeVenda = parseDataSegura(lead?.data_venda);
    if (timeVenda > 0) return timeVenda;
  }
  const timeMovimentacao = parseDataSegura(lead?.data_movimentacao);
  if (timeMovimentacao > 0) return timeMovimentacao;
  return parseDataSegura(lead?.created_at);
};

export const getHorasParado = (lead: any): number => {
  const timeMovimentacao = parseDataSegura(lead?.data_movimentacao);
  const timeMs = timeMovimentacao > 0 ? timeMovimentacao : parseDataSegura(lead?.created_at);
  if (!timeMs) return 0;
  return Math.floor((Date.now() - timeMs) / (1000 * 60 * 60));
};

export const formatarMoeda = (val?: number | string | null): string => {
  const num = parseValorMonetario(val);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/**
 * Converte qualquer formato numérico ou string brasileira ("1.500,00", "1500,50", "R$ 2.000")
 * em um número de ponto flutuante confiável sem gerar NaN ou zerar indevidamente.
 */
export const parseValorMonetario = (val?: number | string | null): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str) return 0;

  let cleaned = str.replace(/[^\d.,-]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * Calcula os limites exatos de período ancorados no fuso de São Paulo (America/Sao_Paulo, UTC-3)
 */
export const getIsoDateBounds = (range: string, customStart?: string, customEnd?: string) => {
  const now = new Date();
  const spNowStr = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
  const [spYear, spMonth, spDay] = spNowStr.split('-').map(Number);

  let start = new Date(0);
  let end = new Date(8640000000000000);

  const r = (range || '').trim();

  if (r === 'this_month' || r === 'Este Mês' || r === 'mes') {
    const lastDay = new Date(spYear, spMonth, 0).getDate();
    const mm = String(spMonth).padStart(2, '0');
    const ddEnd = String(lastDay).padStart(2, '0');
    start = new Date(`${spYear}-${mm}-01T00:00:00.000-03:00`);
    end = new Date(`${spYear}-${mm}-${ddEnd}T23:59:59.999-03:00`);
  } else if (r === 'last_month' || r === 'Mês Anterior' || r === 'mes_anterior') {
    const prevYear = spMonth === 1 ? spYear - 1 : spYear;
    const prevMonth = spMonth === 1 ? 12 : spMonth - 1;
    const lastDay = new Date(prevYear, prevMonth, 0).getDate();
    const mm = String(prevMonth).padStart(2, '0');
    const ddEnd = String(lastDay).padStart(2, '0');
    start = new Date(`${prevYear}-${mm}-01T00:00:00.000-03:00`);
    end = new Date(`${prevYear}-${mm}-${ddEnd}T23:59:59.999-03:00`);
  } else if (r === 'today' || r === 'Hoje' || r === 'hoje') {
    start = new Date(`${spNowStr}T00:00:00.000-03:00`);
    end = new Date(`${spNowStr}T23:59:59.999-03:00`);
  } else if (r === 'yesterday' || r === 'Ontem') {
    const yesterdayDate = new Date(spYear, spMonth - 1, spDay - 1);
    const yY = yesterdayDate.getFullYear();
    const yM = String(yesterdayDate.getMonth() + 1).padStart(2, '0');
    const yD = String(yesterdayDate.getDate()).padStart(2, '0');
    const yStr = `${yY}-${yM}-${yD}`;
    start = new Date(`${yStr}T00:00:00.000-03:00`);
    end = new Date(`${yStr}T23:59:59.999-03:00`);
  } else if (r === 'last_7' || r === 'Últimos 7 dias') {
    const sevenAgoDate = new Date(spYear, spMonth - 1, spDay - 6);
    const sY = sevenAgoDate.getFullYear();
    const sM = String(sevenAgoDate.getMonth() + 1).padStart(2, '0');
    const sD = String(sevenAgoDate.getDate()).padStart(2, '0');
    const sStr = `${sY}-${sM}-${sD}`;
    start = new Date(`${sStr}T00:00:00.000-03:00`);
    end = new Date(`${spNowStr}T23:59:59.999-03:00`);
  } else if (r === 'custom') {
    if (customStart) {
      start = new Date(`${customStart}T00:00:00.000-03:00`);
    }
    if (customEnd) {
      end = new Date(`${customEnd}T23:59:59.999-03:00`);
    }
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime()
  };
};

/**
 * Filtro determinístico de período:
 * - Para a coluna 'Tratamento Fechado' (status === 'vendido'), filtra ESTRITAMENTE pela data_venda
 * - Para as demais colunas, avalia created_at, data_agendamento, data_movimentacao e ultima_interacao.
 */
export const isLeadWithinPeriod = (
  lead: any,
  dateRange: string,
  customStart?: string,
  customEnd?: string
): boolean => {
  if (!lead) return false;
  const r = (dateRange || '').trim();
  if (!r || r === 'all' || r === 'Todo o Período' || r === 'todos') return true;

  const bounds = getIsoDateBounds(r, customStart, customEnd);
  const statusNorm = (lead.status || 'novo').toLowerCase().trim();

  if (statusNorm === 'vendido') {
    const msVenda = parseDataSegura(lead.data_venda);
    const targetMs = msVenda > 0
      ? msVenda
      : (parseDataSegura(lead.data_movimentacao) || parseDataSegura(lead.created_at));
    return targetMs >= bounds.startMs && targetMs <= bounds.endMs;
  }

  const datas = [
    parseDataSegura(lead.created_at || lead.created),
    parseDataSegura(lead.data_agendamento),
    parseDataSegura(lead.data_movimentacao),
    parseDataSegura(lead.ultima_interacao || lead['última_interação'])
  ];

  return datas.some((timeMs) => timeMs >= bounds.startMs && timeMs <= bounds.endMs);
};

/**
 * Busca paginada de TODOS os leads na tabela dentup_leads em lotes de 1000 registros,
 * superando o limite padrão de 1000 linhas por requisição do PostgREST/Supabase.
 */
export const fetchAllLeadsFromSupabase = async (supabaseClient: any): Promise<any[]> => {
  const PAGE_SIZE = 1000;
  let allLeads: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseClient
      .from('dentup_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Erro ao buscar lote de leads:', error);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    allLeads = allLeads.concat(data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return allLeads;
};

/**
 * Extrai código de Voucher VIP de uma mensagem de texto da IA Lara.
 * Exemplo suportado: "🎟️ **Voucher VIP: DENTUP-SAN-1588**" -> "DENTUP-SAN-1588"
 */
export const extrairVoucherDeTexto = (texto?: string | null): string | null => {
  if (!texto || typeof texto !== 'string') return null;

  const matchDentup = texto.match(/\b(DENTUP-[A-Z0-9]{2,6}-\d{3,6})\b/i);
  if (matchDentup && matchDentup[1]) {
    return matchDentup[1].toUpperCase().trim();
  }

  const matchVoucher = texto.match(/Voucher\s*VIP\s*:\s*\*?\*?\s*([A-Z0-9-]{6,25})/i);
  if (matchVoucher && matchVoucher[1]) {
    return matchVoucher[1].toUpperCase().trim();
  }

  return null;
};

/**
 * Retorna a sigla de 3 letras da unidade para compor o Voucher VIP.
 */
export const obterSiglaUnidade = (unidade?: string | null): string => {
  const u = (unidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (u.includes('diadema')) return 'DIA';
  if (u.includes('maua')) return 'MAU';
  if (u.includes('mateus')) return 'SMA';
  return 'SAN';
};

/**
 * REGRA DEFINITIVA DE AUDITORIA:
 * O agendamento pertence à IA Lara se e SOMENTE se:
 * 1. Há um Voucher VIP real emitido no banco (capturado da mensagem da Lara no chat).
 * 2. OU foi expressamente marcado como Lara sem intervenção humana no atendimento (não pausado e sem responsável humano anterior ao agendamento).
 * 
 * Se o chat foi assumido por uma atendente humana (ex: Gyovana Freire, Camila) antes de agendar,
 * e a Lara NÃO emitiu voucher no chat, O AGENDAMENTO PERTENCE À ATENDENTE HUMANA / CLÍNICA!
 */
export const isLeadAgendadoPelaLara = (lead: any): boolean => {
  if (!lead) return false;

  // 1. Se tem Voucher VIP real gravado, foi 100% Lara no WhatsApp
  if (lead.voucher && String(lead.voucher).trim() !== '') {
    return true;
  }

  const tipoAgendamento = (lead.tipo_agendamento || '').toLowerCase().trim();
  const agendadoPor = (lead.agendado_por || '').toLowerCase().trim();
  const isPausadoHumano = Boolean(lead.is_paused);
  const temAtendenteHumano = Boolean(lead.responsavel_id) || (lead.responsavel_nome && !lead.responsavel_nome.toLowerCase().includes('lara'));

  // 2. Se foi assumido por atendente humano no chat e NÃO teve voucher emitido pela Lara, É DA CLÍNICA!
  if (isPausadoHumano && temAtendenteHumano) {
    return false;
  }

  // 3. Se foi explicitamente marcado como clínica ou tem nome de atendente humano em agendado_por
  if (
    tipoAgendamento === 'clinica' ||
    agendadoPor.includes('clínica') ||
    agendadoPor.includes('clinica') ||
    agendadoPor.includes('recepção') ||
    agendadoPor.includes('recepcao') ||
    (agendadoPor !== '' && !agendadoPor.includes('lara'))
  ) {
    return false;
  }

  // 4. Se está marcado como tipo_agendamento === 'lara' ou agendado_por === 'Lara (IA)' sem atendente humano ter assumido
  if ((tipoAgendamento === 'lara' || agendadoPor.includes('lara')) && !isPausadoHumano) {
    return true;
  }

  return false;
};

/**
 * Retorna o Voucher VIP do lead SOMENTE SE existir um voucher real no banco.
 * NUNCA fabrica voucher fictício para não roubar agendamentos da recepção!
 */
export const obterVoucherDoLead = (lead: any): string | null => {
  if (!lead) return null;

  if (lead.voucher && String(lead.voucher).trim() !== '') {
    return String(lead.voucher).trim().toUpperCase();
  }

  return null;
};

/**
 * Atualiza um lead no Supabase com resiliência automática:
 * Caso as colunas novas (voucher, vendedor_nome, vendedor_id) ainda não tenham sido criadas no banco via SQL,
 * faz fallback automático removendo apenas as colunas ausentes para nunca falhar a operação.
 */
export const updateLeadResiliente = async (
  supabaseClient: any,
  leadId: string | number,
  updates: Record<string, any>
): Promise<{ error: any }> => {
  const { error } = await supabaseClient
    .from('dentup_leads')
    .update(updates)
    .eq('id', leadId);

  if (error) {
    const msg = (error.message || '').toLowerCase();
    const colunasNovas = ['voucher', 'vendedor_nome', 'vendedor_id'];
    const temErroColunaNova = colunasNovas.some((col) => msg.includes(col));

    if (temErroColunaNova) {
      const safeUpdates = { ...updates };
      colunasNovas.forEach((col) => delete safeUpdates[col]);

      if (updates.vendedor_nome && !safeUpdates.responsavel_nome) {
        safeUpdates.responsavel_nome = updates.vendedor_nome;
      }
      if (updates.vendedor_id && !safeUpdates.responsavel_id) {
        safeUpdates.responsavel_id = updates.vendedor_id;
      }

      if (Object.keys(safeUpdates).length > 0) {
        const retry = await supabaseClient
          .from('dentup_leads')
          .update(safeUpdates)
          .eq('id', leadId);
        return { error: retry.error };
      }
    }
  }

  return { error };
};
