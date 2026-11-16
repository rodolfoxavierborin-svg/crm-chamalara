// File: src/utils/formatters.ts

/**
 * Formata valores numéricos para Moeda Brasileira (R$)
 */
export const formatCurrency = (value: number | string | null | undefined): string => {
  if (!value) return 'R$ 0,00';
  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
  if (isNaN(numericValue)) return 'R$ 0,00';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numericValue);
};

/**
 * Limpa e formata números de telefone para exibição
 */
export const formatPhoneNumber = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
};

/**
 * Normaliza um telefone brasileiro para o padrão numérico internacional do WhatsApp (DDI 55 + DDD + número).
 * Retorna null caso não haja dígitos suficientes para um link válido.
 */
export const normalizeWhatsAppDigits = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (digits.length < 12) return null;
  return digits;
};

/**
 * Gera a saudação padrão pré-preenchida para contato da recepção pelo WhatsApp.
 */
export const buildDentupGreeting = (name?: string | null): string => {
  const cleanName = (name || '').trim();
  if (cleanName && cleanName.toLowerCase() !== 'sem nome') {
    const primeiroNome = cleanName.split(/\s+/)[0];
    return `Olá ${primeiroNome}, tudo bem? Aqui é da Dent'up Odontologia!`;
  }
  return "Olá, tudo bem? Aqui é da Dent'up Odontologia!";
};

/**
 * Gera o Universal Link oficial do WhatsApp (wa.me), compatível com iOS Safari, Android Chrome e Desktop.
 */
export const buildWhatsAppLink = (
  phone: string | null | undefined,
  prefillText?: string
): string | null => {
  const digits = normalizeWhatsAppDigits(phone);
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (prefillText && prefillText.trim()) {
    return `${base}?text=${encodeURIComponent(prefillText.trim())}`;
  }
  return base;
};