// File: src/utils/dateUtils.ts

/**
 * Converte qualquer formato de data do Supabase (timestamptz UTC +00, YYYY-MM-DD ou DD/MM/YYYY)
 * para Timestamp em milissegundos de forma 100% determinística e compatível com America/Sao_Paulo.
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

      // 1. Formato brasileiro DD/MM/YYYY (com ou sem hora)
      const brMatch = cleanStr.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (brMatch) {
        const [, dd, mm, yyyy, hh = '12', min = '00', ss = '00'] = brMatch;
        const ms = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`).getTime();
        return isNaN(ms) ? 0 : ms;
      }

      // 2. Data pura ISO (YYYY-MM-DD) ou Timestamp meia-noite UTC (00:00:00Z / 00:00:00+00)
      // Ancora em 12:00:00-03:00 (São Paulo) para evitar deslocamento de -3h para o dia anterior (21h)
      const dateOnlyOrMidnightMatch = cleanStr.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]00:00:00(?:\.0+)?(?:Z|[+-]00(?::?00)?)?)?$/
      );
      if (dateOnlyOrMidnightMatch) {
        const [, yyyy, mm, dd] = dateOnlyOrMidnightMatch;
        const ms = new Date(`${yyyy}-${mm}-${dd}T12:00:00-03:00`).getTime();
        return isNaN(ms) ? 0 : ms;
      }

      // 3. Timestamps completos com horário específico
      const normalizedStr = cleanStr.replace(' ', 'T');
      const parsed = new Date(normalizedStr).getTime();
      return isNaN(parsed) ? 0 : parsed;
    }
  } catch (e) {
    return 0;
  }

  return 0;
};

/**
 * Extrai a string de data YYYY-MM-DD estritamente no fuso de São Paulo (America/Sao_Paulo)
 */
export const toDateStrSP = (dataInput: any): string => {
  const ms = parseDataSegura(dataInput);
  if (ms <= 0) return '';
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
};

/**
 * Retorna o timestamp em ms da última interação do lead
 * Coluna oficial do banco: ultima_interacao
 */
export const getUltimaInteracao = (lead: any): number => {
  if (!lead) return 0;
  const rawDate = lead.ultima_interacao || lead['última_interação'] || lead.created_at;
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
