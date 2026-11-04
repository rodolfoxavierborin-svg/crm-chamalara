// File: src/components/kanban/LeadDrawer.tsx

"use client";

import React, { useState } from 'react';
import { toDateStrSP } from '../../utils/dateUtils';
import {
  parseValorMonetario,
  isLeadAgendadoPelaLara,
  obterVoucherDoLead
} from '../../utils/kanbanUtils';

const LISTA_UNIDADES = ['Santo André', 'Diadema', 'Mauá', 'São Mateus'];

const OPCOES_PROCEDIMENTO_PADRAO = [
  'Não Informado',
  'Avaliação para prótese dentária',
  'Implante Dentário',
  'Prótese Dentária',
  'Aparelho Ortodôntico',
  'Avaliação Geral',
  'Limpeza / Profilaxia',
  'Clareamento Dentário',
  'Tratamento de Canal',
  'Extração / Cirurgia'
];

const OPCOES_FEEDBACK_PADRAO = [
  'Não Informado',
  'FECHOU',
  'MARCOU RETORNO',
  'ACHOU CARO',
  'NÃO QUIZ',
  'SEM INTERESSE',
  'VOU FALAR COM A FAMILIA',
  'SEM DINHEIRO'
];

const MOTIVOS_PAUSA_PADRAO = [
  'Paciente solicitou falar com atendente humano',
  'Dúvida clínica específica / fora do escopo da IA',
  'Negociação de valores / condições de pagamento',
  'Paciente compareceu presencialmente à clínica',
  'Agendamento complexo ou encaixe de emergência',
  'Outro motivo'
];

const formatarTelefone = (phone?: string | null): string => {
  if (!phone) return 'Sem Telefone';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 13 && clean.startsWith('55')) {
    return `(${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  return phone;
};

const formatarDataInput = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  return toDateStrSP(isoDate);
};

const formatarDatetimeInput = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch (_) {
    return '';
  }
};

const dateInputToISO = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00-03:00`;
};

interface LeadDrawerProps {
  lead: any | null;
  profiles?: any[];
  onClose: () => void;
  onUpdateLead: (campo: string | Record<string, any>, valor?: any) => void;
  onSelectLead?: (lead: any) => void;
  userProfile?: any;
}

export default function LeadDrawer({
  lead,
  profiles = [],
  onClose,
  onUpdateLead,
  onSelectLead,
  userProfile,
}: LeadDrawerProps) {
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState(MOTIVOS_PAUSA_PADRAO[0]);
  const [motivoPausaOutro, setMotivoPausaOutro] = useState('');

  if (!lead) return null;

  const cargoNorm = (userProfile?.cargo || '').toLowerCase();
  const isManagerOrAdmin = cargoNorm.includes('admin') || cargoNorm.includes('gerente') || cargoNorm.includes('gestor');

  // Trava de permissão de chat: se o card está com IA pausada por outro operador humano
  const leadRespId = lead.responsavel_id;
  const currentUserId = userProfile?.id;
  const hasResponsible = Boolean(lead.is_paused) && leadRespId && String(leadRespId).trim() !== '' && String(leadRespId) !== 'null';
  const isLockedByOther = hasResponsible && currentUserId && String(leadRespId) !== String(currentUserId) && !isManagerOrAdmin;

  const agendadoPorLara = isLeadAgendadoPelaLara(lead);
  const voucherDetectado = obterVoucherDoLead(lead);

  // Função exclusiva para Gestor/Admin liberar o card (Resetar Posse de Chat e Venda Indevida)
  const handleLiberarCard = () => {
    if (!confirm('Deseja realmente liberar este paciente? O operador de chat atual será desvinculado (o agendamento original da Lara permanece protegido).')) {
      return;
    }
    if (typeof onUpdateLead === 'function') {
      onUpdateLead({
        responsavel_id: null,
        responsavel_nome: null,
        pausado_por: null,
        motivo_pausa: null,
      });
    }
  };

  const procedimentoAtual = lead.procedimento || 'Não Informado';
  const opcoesProcedimento = OPCOES_PROCEDIMENTO_PADRAO.includes(procedimentoAtual)
    ? OPCOES_PROCEDIMENTO_PADRAO
    : [procedimentoAtual, ...OPCOES_PROCEDIMENTO_PADRAO];

  const feedbackAtual = lead.feedback || 'Não Informado';
  const opcoesFeedback = OPCOES_FEEDBACK_PADRAO.includes(feedbackAtual)
    ? OPCOES_FEEDBACK_PADRAO
    : [feedbackAtual, ...OPCOES_FEEDBACK_PADRAO];

  // Confirmação de pausa da IA com registro do motivo e autoria do chat (sem sobrescrever agendamento da Lara)
  const handleConfirmPauseAI = () => {
    const motivoFinal = motivoPausa === 'Outro motivo' 
      ? (motivoPausaOutro.trim() || 'Outro motivo não especificado')
      : motivoPausa;

    const agoraISO = new Date().toISOString();
    const nomeResponsavel = userProfile?.nome || userProfile?.email || 'Atendente';
    const idResponsavel = userProfile?.id || null;

    if (typeof onUpdateLead === 'function') {
      const updates: Record<string, any> = {
        is_paused: true,
        responsavel_id: idResponsavel,
        responsavel_nome: nomeResponsavel,
        motivo_pausa: motivoFinal,
        pausado_por: nomeResponsavel,
        data_pausa: agoraISO,
        data_movimentacao: agoraISO,
      };

      if (agendadoPorLara && lead.voucher) {
        updates.tipo_agendamento = 'lara';
        updates.agendado_por = 'Lara (IA)';
        updates.voucher = lead.voucher;
      }

      onUpdateLead(updates);
    }

    setShowPauseModal(false);
  };

  // Identifica o vendedor selecionado para o select comercial
  const vendedorAtualNome = lead.vendedor_nome || (lead.status === 'vendido' ? lead.responsavel_nome : '') || '';

  return (
    <>
      {/* MÁSCARA ESCURA DE FUNDO */}
      <div 
        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" 
        onClick={onClose} 
      />

      {/* DRAWER LATERAL */}
      <div className="w-[470px] bg-white shadow-2xl flex flex-col z-30 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right-8 duration-300">
        
        {/* CABEÇALHO */}
        <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Ficha do Paciente</h3>
            <p className="text-xs text-slate-500 mt-0.5">Gestão de Informações, Agendamento & Venda</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 text-xl font-light cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* ALERTA DE TRAVA DE SEGURANÇA (SE PERTENCER A OUTRO ATENDENTE NO CHAT) */}
        {isLockedByOther && (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex items-center justify-between gap-2 text-xs text-amber-800 font-semibold">
            <div className="flex items-center gap-2">
              <span className="text-base">🔒</span>
              <span>Chat assumido por <strong>{lead.responsavel_nome || 'outro colega'}</strong>. Modo somente leitura ativado.</span>
            </div>
          </div>
        )}

        {/* BARRA DE GESTÃO DO ADMINISTRADOR (RESETAR / LIBERAR CARD) */}
        {isManagerOrAdmin && (lead.responsavel_nome || lead.responsavel_id) && (
          <div className="bg-blue-50/80 border-b border-blue-200 px-8 py-2.5 flex items-center justify-between text-xs text-blue-900 font-semibold">
            <div className="flex items-center gap-1.5">
              <span>🛡️</span>
              <span>Vinculado a: <strong>{lead.responsavel_nome || 'Colaborador'}</strong></span>
            </div>
            <button
              type="button"
              onClick={handleLiberarCard}
              className="px-2.5 py-1 bg-white border border-blue-300 hover:bg-blue-100 text-blue-800 rounded-md font-bold text-[11px] transition-all shadow-2xs cursor-pointer"
              title="Desvincula o colaborador para limpar posse indevida"
            >
              🔓 Desvincular Operador
            </button>
          </div>
        )}
        
        {/* CONTEÚDO DO FORMULÁRIO */}
        <div className="p-8 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* STATUS ATUAL DO ATENDIMENTO NO WHATSAPP */}
          <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Canal de Atendimento (Chat)
              </span>

              {lead.is_paused ? (
                <span className="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                  <span>👤</span>
                  <span>Chat: {lead.responsavel_nome || 'Equipe'}</span>
                </span>
              ) : (
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                  <span>🤖</span>
                  <span>Conduzido pela Lara (IA)</span>
                </span>
              )}
            </div>

            {lead.is_paused && lead.motivo_pausa && (
              <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-200 text-slate-600 mt-1">
                <span className="font-bold text-slate-700">Motivo da Interrupção:</span> {lead.motivo_pausa}
                {lead.pausado_por && (
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Assumido por: {lead.pausado_por}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* NOME COMPLETO */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Nome Completo</label>
            <input 
              type="text" 
              disabled={isLockedByOther}
              defaultValue={lead.name || ''} 
              onBlur={(e) => onUpdateLead('name', e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed" 
            />
          </div>
          
          {/* WHATSAPP */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">WhatsApp</label>
            <input 
              type="text" 
              readOnly 
              value={formatarTelefone(lead.phone || lead.phone_number)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-500 outline-none cursor-not-allowed" 
            />
          </div>

          {/* UNIDADE E PROCEDIMENTO */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Unidade</label>
              <select 
                disabled={isLockedByOther}
                value={lead.unidade || 'Pendente'} 
                onChange={(e) => onUpdateLead('unidade', e.target.value)} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
              >
                {['Pendente', ...LISTA_UNIDADES].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Procedimento</label>
              <select 
                disabled={isLockedByOther}
                value={procedimentoAtual} 
                onChange={(e) => onUpdateLead('procedimento', e.target.value)} 
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
              >
                {opcoesProcedimento.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* FEEDBACK DO PACIENTE */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Feedback do Paciente</label>
            <select 
              disabled={isLockedByOther}
              value={feedbackAtual} 
              onChange={(e) => onUpdateLead('feedback', e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm font-medium cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
            >
              {opcoesFeedback.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* PROMOTOR / ORIGEM */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Promotor / Origem</label>
            <input 
              type="text" 
              disabled={isLockedByOther}
              defaultValue={lead.promotor || ''} 
              onBlur={(e) => onUpdateLead('promotor', e.target.value)} 
              placeholder="Ex: Passante de Rua..." 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed" 
            />
          </div>

          {/* SEÇÃO DE AGENDAMENTO (BLINDAGEM 100% DO VOUCHER VIP E AUTORIA DA LARA) */}
          <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-indigo-900 uppercase flex items-center gap-1.5">
                <span>📅 Agendamento (Pré-Venda)</span>
              </label>

              {/* SELO DE AUDITORIA INALTERÁVEL DA ORIGEM */}
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                !agendadoPorLara
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : 'bg-indigo-100 text-indigo-800 border-indigo-300'
              }`}>
                {!agendadoPorLara ? (
                  <><span>🏥</span> Agendado pela Clínica</>
                ) : (
                  <><span>🤖</span> Agendado pela Lara (IA) 🔒</>
                )}
              </span>
            </div>

            {/* EXIBIÇÃO DO VOUCHER VIP INVIOLÁVEL */}
            {agendadoPorLara && voucherDetectado && (
              <div className="bg-white/90 border border-indigo-200 rounded-lg px-3 py-2 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎟️</span>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block leading-none">
                      Voucher VIP Oficial
                    </span>
                    <span className="text-xs font-black font-mono text-indigo-700">
                      {voucherDetectado}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  🔒 Autoria Blindada
                </span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Data e Horário da Consulta
              </label>
              <input
                type="datetime-local"
                disabled={isLockedByOther}
                defaultValue={formatarDatetimeInput(lead.data_agendamento)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    onUpdateLead('data_agendamento', null);
                    return;
                  }
                  const d = new Date(val);
                  if (!isNaN(d.getTime())) {
                    const updates: any = { data_agendamento: d.toISOString() };
                    // Se já era da Lara com voucher confirmado no chat, preserva 100% a Lara
                    if (agendadoPorLara && lead.voucher) {
                      updates.tipo_agendamento = 'lara';
                      updates.agendado_por = 'Lara (IA)';
                    } else {
                      // Se foi a recepção/atendente que definiu o horário, mérito é da atendente/clínica
                      updates.tipo_agendamento = 'clinica';
                      updates.agendado_por = userProfile?.nome || lead.responsavel_nome || 'Recepção';
                      if (lead.status === 'novo' || lead.status === 'agendado') {
                        updates.status = 'agendado_clinica';
                      }
                    }
                    onUpdateLead(updates);
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 shadow-sm cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
            </div>

            <p className="text-[10px] text-slate-500 italic flex items-center justify-between">
              <span>
                Mérito do Agendamento: <strong className="text-slate-700">{agendadoPorLara ? 'Lara (IA)' : (lead.agendado_por || 'Recepção')}</strong>
              </span>
              {agendadoPorLara && (
                <span className="text-indigo-600 font-semibold">Protegido contra alteração</span>
              )}
            </p>
          </div>

          {/* ANOTAÇÕES INTERNAS */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Anotações Internas</label>
            <textarea 
              rows={3} 
              disabled={isLockedByOther}
              defaultValue={lead.notas_internas || ''} 
              onBlur={(e) => onUpdateLead('notas_internas', e.target.value)} 
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed" 
              placeholder="Observações do atendimento clínico..." 
            />
          </div>

          {/* SEÇÃO FINANCEIRA / FECHAMENTO COMERCIAL NA CLÍNICA (SEPARADO DO AGENDAMENTO) */}
          <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-4">
            <div className="flex justify-between items-center border-b border-emerald-200/60 pb-2">
              <label className="text-xs font-extrabold text-emerald-900 uppercase flex items-center gap-1.5">
                <span>💰 Fechamento Comercial (Na Clínica)</span>
              </label>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                Etapa de Venda
              </span>
            </div>

            {/* VALOR DO TRATAMENTO (SEM APROPRIAÇÃO AUTOMÁTICA OCULTA) */}
            <div>
              <label className="text-[11px] font-bold text-emerald-800 uppercase block mb-1">
                Valor do Tratamento Fechado (R$)
              </label>
              <input 
                type="text" 
                disabled={isLockedByOther}
                placeholder="Ex: 3500,00" 
                defaultValue={lead.valor_venda ? String(lead.valor_venda).replace('.', ',') : ''} 
                onBlur={(e) => {
                  const valNum = parseValorMonetario(e.target.value);
                  onUpdateLead({
                    valor_venda: valNum > 0 ? valNum : null
                  });
                }} 
                className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-extrabold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm disabled:bg-slate-50 disabled:cursor-not-allowed" 
              />
            </div>

            {/* SELETOR EXPLÍCITO DE QUEM FECHOU A VENDA NA CLÍNICA */}
            <div>
              <label className="text-[11px] font-bold text-emerald-800 uppercase block mb-1">
                Quem Fechou a Venda na Clínica? (Vendedor / Closer)
              </label>
              <select
                disabled={isLockedByOther}
                value={vendedorAtualNome}
                onChange={(e) => {
                  const nomeEscolhido = e.target.value;
                  if (!nomeEscolhido) {
                    onUpdateLead({
                      vendedor_id: null,
                      vendedor_nome: null,
                    });
                    return;
                  }
                  if (nomeEscolhido === 'Equipe da Recepção / Clínicas') {
                    onUpdateLead({
                      vendedor_id: null,
                      vendedor_nome: 'Equipe da Recepção / Clínicas',
                    });
                    return;
                  }
                  const perfil = profiles.find(
                    (p) => (p.nome || p.email) === nomeEscolhido
                  );
                  onUpdateLead({
                    vendedor_id: perfil?.id || null,
                    vendedor_nome: nomeEscolhido,
                  });
                }}
                className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-xs font-bold text-emerald-900 outline-none focus:border-emerald-500 shadow-sm cursor-pointer disabled:bg-slate-50"
              >
                <option value="">-- Não atribuído / Selecionar Vendedor --</option>
                {profiles.map((p) => {
                  const labelNome = p.nome || p.email;
                  return (
                    <option key={p.id} value={labelNome}>
                      👤 {labelNome} ({(p.cargo || 'Colaborador').toUpperCase()})
                    </option>
                  );
                })}
                {vendedorAtualNome &&
                  vendedorAtualNome !== 'Equipe da Recepção / Clínicas' &&
                  !profiles.some((p) => (p.nome || p.email) === vendedorAtualNome) && (
                    <option value={vendedorAtualNome}>👤 {vendedorAtualNome}</option>
                  )}
                <option value="Equipe da Recepção / Clínicas">
                  🏥 Equipe da Recepção / Clínicas (Geral)
                </option>
              </select>
              <p className="text-[10px] text-emerald-700 mt-1 italic">
                Define quem recebe o mérito da venda presencial no Analytics, mantendo o agendamento intacto.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-emerald-800 uppercase block mb-1 flex items-center gap-1.5">
                <span>📅 Data da Venda</span>
              </label>
              <input 
                type="date" 
                disabled={isLockedByOther}
                value={formatarDataInput(lead.data_venda)} 
                onChange={(e) => {
                  const isoStr = dateInputToISO(e.target.value);
                  onUpdateLead('data_venda', isoStr);
                }}
                className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-semibold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed" 
              />
            </div>
          </div>
        </div>

        {/* RODAPÉ DO DRAWER COM AÇÕES */}
        <div className="p-6 border-t border-slate-100 bg-white">
          <div className="grid grid-cols-2 gap-4">
            
            {/* BOTÃO EXCLUSIVO DE PAUSAR / RETOMAR IA */}
            <button 
              type="button"
              disabled={isLockedByOther}
              onClick={() => {
                if (!lead.is_paused) {
                  setShowPauseModal(true);
                } else {
                  if (typeof onUpdateLead === 'function') {
                    onUpdateLead({
                      is_paused: false,
                      pausado_por: null,
                    });
                  }
                }
              }} 
              className={`py-2.5 rounded-lg font-bold text-xs transition-colors border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                lead.is_paused 
                  ? 'bg-red-500 text-white hover:bg-red-600' 
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {lead.is_paused ? '▶ Retomar IA (Lara)' : '⏸️ Pausar IA (Assumir Chat)'}
            </button>
            
            <button 
              type="button"
              onClick={() => {
                if (onSelectLead) onSelectLead(lead);
              }} 
              className="py-2.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all shadow-sm cursor-pointer"
            >
              Abrir no Chat
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO & JUSTIFICATIVA OBRIGATÓRIA (TRAVA ANTI-FURTO) */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3 className="text-sm font-bold">Interromper IA Lara no Chat?</h3>
              </div>
              <button 
                onClick={() => setShowPauseModal(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                A <strong>Lara (IA)</strong> está conduzindo este paciente no WhatsApp. Ao assumir o chat, você ficará responsável pelas mensagens, mas <strong>o mérito de agendamento da Lara permanece protegido</strong>:
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motivo da Intervenção no Chat:
                </label>
                <select
                  value={motivoPausa}
                  onChange={(e) => setMotivoPausa(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer"
                >
                  {MOTIVOS_PAUSA_PADRAO.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {motivoPausa === 'Outro motivo' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Especifique o motivo:
                  </label>
                  <textarea
                    rows={2}
                    value={motivoPausaOutro}
                    onChange={(e) => setMotivoPausaOutro(e.target.value)}
                    placeholder="Descreva o motivo da intervenção..."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm"
                  />
                </div>
              )}

              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-[11px] text-amber-800">
                <span>🛡️ O chat será atribuído a <strong>{userProfile?.nome || 'Seu Usuário'}</strong> e o histórico será auditado.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPauseAI}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all shadow-sm cursor-pointer"
                >
                  Confirmar e Assumir Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
