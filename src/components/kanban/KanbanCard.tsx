// File: src/components/kanban/KanbanCard.tsx

"use client";

import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { parseDataSegura } from '../../utils/dateUtils';

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
  formatarTelefone = defaultFormatarTelefone,
  formatarMoeda = defaultFormatarMoeda,
  formatarDataCurta = defaultFormatarDataCurta,
  formatarDataAgendamento = defaultFormatarDataAgendamento,
  formatarTempoParado = defaultFormatarTempoParado,
  getHorasParado = defaultGetHorasParado,
}: KanbanCardProps) {
  const statusAtual = colunaId || lead?.status || 'novo';
  const horasParado = getHorasParado(lead);
  const isCritico = horasParado >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(statusAtual);
  const isAlerta = horasParado >= 12 && horasParado < 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(statusAtual);

  const handleCardClick = () => {
    if (onSelectLead) {
      onSelectLead(lead);
    } else if (onClickLead) {
      onClickLead(lead);
    }
  };

  const dataAgendamentoTexto = formatarDataAgendamento(lead.data_agendamento);
  const valorVendaNum = Number(lead.valor_venda) || 0;

  const cardContent = (
    <div
      onClick={handleCardClick}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer group bg-white shadow-sm hover:shadow-md relative mb-3 ${
        isCritico
          ? 'border-red-300/80 bg-red-50/20 hover:border-red-400'
          : isAlerta
          ? 'border-amber-300/80 bg-amber-50/20 hover:border-amber-400'
          : 'border-slate-200 hover:border-blue-400'
      }`}
    >
      {/* CABEÇALHO DO CARD: NOME DO PACIENTE E BADGE HUMANO */}
      <div className="flex justify-between items-start mb-1 gap-2">
        <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors line-clamp-1 leading-snug">
          {lead.name || 'Sem Nome'}
        </h4>
        {lead.is_paused && (
          <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-md shrink-0 shadow-xs">
            Humano
          </span>
        )}
      </div>

      {/* TELEFONE FORMATADO COM DDD (EX: (11) 99999-8888) */}
      <p className="text-xs font-semibold text-slate-400 mb-2">
        {formatarTelefone(lead.phone || lead.phone_number)}
      </p>

      {/* ÁREA DE INFORMAÇÕES DE DESTAQUE (VALORES / AGENDAMENTO / ORIGEM) */}
      <div className="space-y-1.5 mb-2.5">
        
        {/* VALOR DA VENDA: REITOR DO CARD (VERDE EMERALD EXCLUSIVO) */}
        {valorVendaNum > 0 && (
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
        )}

        {/* AGENDAMENTO: ROXO / INDIGO COMPACTO (SEM TEXTO REDUNDANTE) */}
        {dataAgendamentoTexto && (
          <div className="inline-flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-lg text-xs font-bold w-fit">
            <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{dataAgendamentoTexto}</span>
          </div>
        )}

        {/* ORIGEM / PROMOTOR (EXIBIDO APENAS SE NÃO HOUVER VENDA/AGENDAMENTO PARA MANTER O CARD ENXUTO) */}
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
