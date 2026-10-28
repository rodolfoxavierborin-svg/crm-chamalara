// File: src/utils/dateUtils.ts

/**
 * Converte qualquer string de data do Postgres/Supabase em timestamp em milissegundos
 * com tratamento seguro para Chrome, Safari e WebViews.
 */
export const parseDataSegura = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0;
  const safeStr = typeof dateStr === 'string' ? dateStr.trim().replace(' ', 'T') : dateStr;
  const time = new Date(safeStr).getTime();
  return isNaN(time) ? 0 : time;
};

/**
 * Obtém a data/hora da última interação do lead
 */
export const getUltimaInteracao = (lead: any): number => {
  const rawDate = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
  return parseDataSegura(rawDate);
};

/**
 * Formata horários no padrão do WhatsApp (Ex: "14:30", "Ontem", "27/10/26")
 */
export const formatarHorarioWhatsApp = (dataIso: string | null): string => {
  if (!dataIso) return '';
  const ms = getUltimaInteracao({ ultima_interacao: dataIso });
  if (ms === 0) return '';

  const data = new Date(ms);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  if (data.toDateString() === hoje.toDateString()) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  } 
  if (data.toDateString() === ontem.toDateString()) {
    return 'Ontem';
  }
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' });
};

/**
 * Verifica se a data do lead pertence ao dia de HOJE considerando o fuso de São Paulo
 */
export const isHoje = (dataIso: string | null | undefined): boolean => {
  if (!dataIso) return false;
  const ms = parseDataSegura(dataIso);
  if (ms === 0) return false;

  const dataTarget = new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return dataTarget === hoje;
};