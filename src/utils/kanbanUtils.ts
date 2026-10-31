// File: src/utils/kanbanUtils.ts

import { parseDataSegura, toDateStrSP } from './dateUtils';

export { parseDataSegura, toDateStrSP };

export const COLUNAS = [
  { id: 'novo', titulo: 'Novos Pacientes', dot: 'bg-blue-500' },
  { id: 'nao_respondeu', titulo: 'Não Respondeu', dot: 'bg-amber-500' },
  { id: 'agendado', titulo: 'Agendados (IA)', dot: 'bg-indigo-500' },
  { id: 'confirmado', titulo: 'Confirmados', dot: 'bg-emerald-500' },
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
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
 *   (com fallback para data_movimentacao || created_at apenas se data_venda for nula no banco).
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

  // REGRA ESTRITA PARA TRATAMENTO FECHADO (status === 'vendido')
  if (statusNorm === 'vendido') {
    const msVenda = parseDataSegura(lead.data_venda);
    const targetMs = msVenda > 0
      ? msVenda
      : (parseDataSegura(lead.data_movimentacao) || parseDataSegura(lead.created_at));
    return targetMs >= bounds.startMs && targetMs <= bounds.endMs;
  }

  // DEMAIS COLUNAS DO PIPELINE
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
    // Trava de segurança para evitar loop infinito (suporta até 20.000 leads)
    if (from >= 20000) break;
  }

  return allLeads;
};
