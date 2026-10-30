// File: src/utils/chatUtils.ts

import { parseDataSegura } from './dateUtils';

// SEPARADOR DE DATA DO CHAT
export const formatDateSeparator = (dataIso: string | Date) => {
  const ms = dataIso instanceof Date ? dataIso.getTime() : parseDataSegura(dataIso);
  const data = new Date(ms);
  
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  if (data.toDateString() === hoje.toDateString()) return 'Hoje';
  if (data.toDateString() === ontem.toDateString()) return 'Ontem';

  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

// HELPER PARA EXTRAIR E FORMATAR CONTEÚDO DAS MENSAGENS
export const parseMensagem = (msg: any) => {
  let raw = msg.message || msg;
  let type = 'human';
  let content = '';

  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { content = raw; }
  }

  if (typeof raw === 'object' && raw !== null) {
    type = raw.type || msg.type || 'human';
    content = raw.content || raw.data?.content || '';
    if (typeof content === 'object') {
      try { content = JSON.stringify(content); } catch (e) { content = ''; }
    }
  }

  return { type, content, isTool: type === 'tool' };
};

// FILTRO PARA OCULTAR MENSAGENS TÉCNICAS E DE FERRAMENTAS INTERNAS DA IA
export const isMensagemTecnica = (msg: any): boolean => {
  const { content, isTool } = parseMensagem(msg);
  if (isTool) return true;
  if (!content || typeof content !== 'string') return false;
  const t = content.trim();
  if (t.startsWith('Calling ') || t.includes('with input:')) return true;
  if (t.includes('Confirmar_Agendamento') || t.includes('Create_an_event') || t.includes('Call_Sub-workflow')) return true;
  return false;
};