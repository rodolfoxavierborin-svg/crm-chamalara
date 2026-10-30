// File: src/utils/dateUtils.ts

/**
 * Converte qualquer formato de data do Supabase (timestamptz UTC +00)
 * para Timestamp em milissegundos de forma 100% determinística.
 */
export const parseDataSegura = (dataInput: any): number => {
  if (!dataInput) return 0;

  try {
    if (dataInput instanceof Date) {
      const ms = dataInput.getTime();
      return isNaN(ms) ? 0 : ms;
    }

    if (typeof dataInput === 'number') {
      return isNaN(dataInput) ? 0 : dataInput;
    }

    if (typeof dataInput === 'string') {
      const cleanStr = dataInput.trim();
      if (!cleanStr) return 0;

      const parsed = new Date(cleanStr).getTime();
      return isNaN(parsed) ? 0 : parsed;
    }
  } catch (e) {
    return 0;
  }

  return 0;
};

/**
 * Retorna o timestamp em ms da última interação do lead
 * Coluna oficial do banco: ultima_interacao
 */
export const getUltimaInteracao = (lead: any): number => {
  if (!lead) return 0;
  const rawDate = lead.ultima_interacao || lead.created_at;
  return parseDataSegura(rawDate);
};

/**
 * Formata o horário do WhatsApp considerando o fuso oficial de Brasília (America/Sao_Paulo)
 */
export const formatarHorarioWhatsApp = (dataIso: string | null): string => {
  const ms = parseDataSegura(dataIso);
  if (ms === 0) return '';

  const dataMs = new Date(ms);

  // Obtém a data no fuso de São Paulo no formato YYYY-MM-DD
  const dataStr = dataMs.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  const ontemObj = new Date();
  ontemObj.setDate(ontemObj.getDate() - 1);
  const ontemStr = ontemObj.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  if (dataStr === hojeStr) {
    return dataMs.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  if (dataStr === ontemStr) {
    return 'Ontem';
  }

  return dataMs.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
};