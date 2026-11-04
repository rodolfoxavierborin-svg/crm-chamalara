// File: src/components/kanban/KanbanCard.tsx

"use client";

import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { parseDataSegura } from '../../utils/dateUtils';
import { isLeadAgendadoPelaLara, obterVoucherDoLead } from '../../utils/kanbanUtils';

const defaultGetHorasParado = (lead: any): number => {
  const timeMovimentacao = parseDataSegura(lead?.data_movimentacao);
  const timeMs = timeMovimentacao > 0 ? timeMovimentacao : parseDataSegura(lead?.created_at);
  if (!timeMs) return 0;
  return Math.floor((Date.now() - timeMs) / (1000 * 60 * 60));
};

const defaultFormatarTempoParado = (horas: number): string => {
  if (horas < 1) return 'Agora';
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  const restHoras = horas % 24;
  return restHoras > 0 ? `${dias}d ${restHoras}h` : `${dias}d`;
};

const defaultFormatarDataAgendamento = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const time = parseDataSegura(dateStr);
  if (!time) return '';
  const date = new Date(time);
  const dataFmt = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const horaFmt = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  return `${dataFmt} às ${horaFmt}`;
};

const defaultFormatarDataCurta = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const time = parseDataSegura(dateStr);
  if (!time) return '';
  return new Date(time).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const defaultFormatarTelefone = (phone?: string | null): string => {
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

const defaultFormatarMoeda = (val?: number | string | null): string => {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface KanbanCardProps {
  lead: any;
  index?: number;
  colunaId?: string;
  onSelectLead?: (lead: any) => void;
  onClickLead?: (lead: any) => void;
  userProfile?: any;
  formatarTelefone?: (phone?: string | null) => string;
  formatarMoeda?: (val?: number | string | null) => string;
  formatarDataCurta?: (dateStr?: string | null) => string;
  formatarDataAgendamento?: (dateStr?: string | null) => string;
  formatarTempoParado?: (horas: number) => string;
  getHorasParado?: (lead: any) => number;
}

export default function KanbanCard({
  lead,
  index,
  colunaId = '',
  onSelectLead,
  onClickLead,
  userProfile,
  formatarTelefone = defaultFormatarTelefone,
  formatarMoeda = defaultFormatarMoeda,
  formatarDataCurta = defaultFormatarDataCurta,
  formatarDataAgendamento = defaultFormatarDataAgendamento,
  formatarTempoParado = defaultFormatarTempoParado,
  getHorasParado = defaultGetHorasParado,
}: KanbanCardProps) {
  const statusAtual = (colunaId || lead?.status || 'novo').toLowerCase().trim();
  const horasParado = getHorasParado(lead);
  const isCritico = horasParado >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(statusAtual);
  const isAlerta = horasParado >= 12 && horasParado < 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(statusAtual);

  const cargoNorm = (userProfile?.cargo || '').toLowerCase();
  const isManagerOrAdmin = cargoNorm.includes('admin') || cargoNorm.includes('gerente') || cargoNorm.includes('gestor');
  
  // Verificação de posse ativa no chat (somente quando a IA está pausada)
  const leadRespId = lead?.responsavel_id;
  const leadRespNome = lead?.responsavel_nome || lead?.pausado_por;
  const currentUserId = userProfile?.id;
  const isOwner = Boolean(lead?.is_paused) && currentUserId && leadRespId && String(currentUserId) === String(leadRespId);
  const isLockedByOther = Boolean(lead?.is_paused) && leadRespId && currentUserId && String(leadRespId) !== String(currentUserId) && !isManagerOrAdmin;

  const handleCardClick = () => {
    if (onSelectLead) {
      onSelectLead(lead);
    } else if (onClickLead) {
      onClickLead(lead);
    }
  };

  const dataAgendamentoTexto = formatarDataAgendamento(lead.data_agendamento);
  const valorVendaNum = Number(lead.valor_venda) || 0;

  const agendadoPelaLara = isLeadAgendadoPelaLara(lead);
  const isAgendamentoClinica = !agendadoPelaLara && (
    (lead.tipo_agendamento || '').toLowerCase() === 'clinica' ||
    statusAtual === 'agendado_clinica' ||
    (lead.status || '').toLowerCase() === 'agendado_clinica'
  );

  const voucherCodigo = agendadoPelaLara ? obterVoucherDoLead(lead) : null;
  const vendedorFechamento = lead?.vendedor_nome || (statusAtual === 'vendido' ? lead?.responsavel_nome : null);

  const cardContent = (
    <div
      onClick={handleCardClick}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer group bg-white shadow-sm hover:shadow-md relative mb-3 ${
        isLockedByOther
          ? 'border-amber-200 bg-amber-50/10 hover:border-amber-400'
          : isCritico
          ? 'border-red-300/80 bg-red-50/20 hover:border-red-400'
          : isAlerta
          ? 'border-amber-300/80 bg-amber-50/20 hover:border-amber-400'
          : 'border-slate-200 hover:border-blue-400'
      }`}
    >
      {/* CABEÇALHO DO CARD: NOME DO PACIENTE E IDENTIFICAÇÃO DO CANAL / AGENDADOR */}
      <div className="flex justify-between items-start mb-1 gap-2">
        <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors line-clamp-1 leading-snug">
          {lead.name || 'Sem Nome'}
        </h4>

        {/* IDENTIFICAÇÃO DO CANAL DE ATENDIMENTO / ORIGEM */}
        <div className="shrink-0 flex items-center gap-1">
          {lead.is_paused ? (
            leadRespNome ? (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 shadow-xs flex items-center gap-1 ${
                  isLockedByOther
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : isOwner
                    ? 'bg-blue-600 text-white font-extrabold'
                    : 'bg-slate-900 text-white'
                }`}
                title={isLockedByOther ? `Chat assumido por ${leadRespNome} (Travado)` : `Chat assumido por: ${leadRespNome}`}
              >
                <span>{isLockedByOther ? '🔒' : '👤'}</span>
                <span className="truncate max-w-[85px]">{leadRespNome}</span>
              </span>
            ) : (
              <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-md shrink-0 shadow-xs">
                👤 Humano
              </span>
            )
          ) : isAgendamentoClinica ? (
            <span
              className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1"
              title={`Agendado pela Clínica (${lead.agendado_por || 'Recepção'})`}
            >
              <span>🏥</span>
              <span className="truncate max-w-[85px]">{lead.agendado_por || 'Clínica'}</span>
            </span>
          ) : (
            <span 
              className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1"
              title="Atendimento e Agendamento pela IA Lara"
            >
              <span>🤖</span>
              <span>Lara (IA)</span>
            </span>
          )}
        </div>
      </div>

      {/* TELEFONE FORMATADO COM DDD */}
      <p className="text-xs font-semibold text-slate-400 mb-2">
        {formatarTelefone(lead.phone || lead.phone_number)}
      </p>

      {/* ÁREA DE INFORMAÇÕES DE DESTAQUE (VALORES / VENDEDOR / AGENDAMENTO / VOUCHER) */}
      <div className="space-y-1.5 mb-2.5">
        
        {/* VALOR DA VENDA + QUEM FECHOU NA CLÍNICA */}
        {valorVendaNum > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 w-fit">
              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg shadow-xs">
                💰 {formatarMoeda(valorVendaNum)}
              </span>
              {lead.data_venda && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-white border border-emerald-100 px-2 py-0.5 rounded-md">
                  📅 {formatarDataCurta(lead.data_venda)}
                </span>
              )}
            </div>

            {vendedorFechamento && (
              <div
                className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50/90 border border-teal-200 px-2 py-0.5 rounded-md w-fit"
                title={`Venda fechada presencialmente na clínica por ${vendedorFechamento}`}
              >
                <span>💼</span>
                <span className="truncate max-w-[170px]">Fechado por: {vendedorFechamento}</span>
              </div>
            )}
          </div>
        )}

        {/* AGENDAMENTO DUPLO: LARA (ROXO/ÍNDIGO) VS CLÍNICA (ESMERALDA/VERDE) */}
        {dataAgendamentoTexto && (
          isAgendamentoClinica ? (
            <div 
              className="inline-flex items-center gap-1.5 bg-emerald-50/90 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg text-xs font-bold w-fit shadow-2xs"
              title={`Agendado pela Clínica / Recepção ${lead.agendado_por ? `(${lead.agendado_por})` : ''}`}
            >
              <span className="text-xs">🏥</span>
              <span>{dataAgendamentoTexto}</span>
            </div>
          ) : (
            <div 
              className="inline-flex items-center gap-1.5 bg-indigo-50/90 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold w-fit shadow-2xs"
              title="Agendado pela IA Lara no WhatsApp"
            >
              <span className="text-xs">🤖</span>
              <span>{dataAgendamentoTexto}</span>
            </div>
          )
        )}

        {/* SELO DO VOUCHER VIP DA LARA */}
        {voucherCodigo && (
          <div
            className="inline-flex items-center gap-1 bg-indigo-50/60 border border-indigo-200/80 text-indigo-800 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold w-fit"
            title="Voucher VIP inalterável gerado pela IA Lara"
          >
            <span>🎟️</span>
            <span>{voucherCodigo}</span>
          </div>
        )}

        {/* ORIGEM / PROMOTOR */}
        {lead.promotor && valorVendaNum === 0 && !dataAgendamentoTexto && (
          <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
            👤 {lead.promotor}
          </span>
        )}
      </div>

      {/* FOOTER DO CARD: UNIDADE À ESQUERDA | TEMPO PARADO À DIREITA */}
      <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-[11px] font-semibold text-slate-500">
        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold text-[10px]">
          {lead.unidade && lead.unidade !== 'Pendente' ? lead.unidade : 'Sem Unidade'}
        </span>

        {/* ALERTA DE TEMPO PARADO (SLA) */}
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 ${
            isCritico
              ? 'bg-red-100 text-red-700 border border-red-200'
              : isAlerta
              ? 'bg-amber-100 text-amber-700 border border-amber-200'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {isCritico && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />}
          {formatarTempoParado(horasParado)}
        </span>
      </div>
    </div>
  );

  if (typeof index === 'number') {
    return (
      <Draggable draggableId={String(lead.id)} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            style={{ ...provided.draggableProps.style }}
            className={snapshot.isDragging ? 'rotate-1 scale-102 z-50' : ''}
          >
            {cardContent}
          </div>
        )}
      </Draggable>
    );
  }

  return cardContent;
}
