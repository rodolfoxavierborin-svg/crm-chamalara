// File: src/utils/kanbanUtils.ts

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

export const parseDataSegura = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0;
  const safeStr = typeof dateStr === 'string' ? dateStr.trim().replace(' ', 'T') : dateStr;
  const time = new Date(safeStr).getTime();
  return isNaN(time) ? 0 : time;
};

export const getTempoCronologicoKanban = (lead: any) => {
  const timeMovimentacao = parseDataSegura(lead?.data_movimentacao);
  if (timeMovimentacao > 0) return timeMovimentacao;
  return parseDataSegura(lead?.created_at);
};

export const getHorasParado = (lead: any): number => {
  const timeMs = getTempoCronologicoKanban(lead);
  if (!timeMs) return 0;
  return Math.floor((Date.now() - timeMs) / (1000 * 60 * 60));
};

export const formatarMoeda = (val?: number | string | null): string => {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const getIsoDateBounds = (range: string, customStart?: string, customEnd?: string) => {
  const now = new Date();
  let start = new Date(0);
  let end = new Date(8640000000000000);

  if (range === 'this_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (range === 'yesterday') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  } else if (range === 'last_7') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (range === 'custom') {
    if (customStart) {
      const [y, m, d] = customStart.split('-').map(Number);
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
    if (customEnd) {
      const [y, m, d] = customEnd.split('-').map(Number);
      end = new Date(y, m - 1, d, 23, 59, 59, 999);
    }
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime()
  };
};