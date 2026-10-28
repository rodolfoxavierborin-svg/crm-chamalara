// File: src/components/kanban/KanbanCard.tsx

"use client";

import React from 'react';

interface KanbanCardProps {
  lead: any;
  colunaId: string;
  onClickLead: (lead: any) => void;
  formatarTelefone: (phone?: string | null) => string;
  formatarMoeda: (val?: number | string | null) => string;
  formatarDataCurta: (dateStr?: string | null) => string;
  formatarDataAgendamento: (dateStr?: string | null) => string;
  formatarTempoParado: (horas: number) => string;
  getHorasParado: (lead: any) => number;
}

export default function KanbanCard({
  lead,
  colunaId,
  onClickLead,
  formatarTelefone,
  formatarMoeda,
  formatarDataCurta,
  formatarDataAgendamento,
  formatarTempoParado,
  getHorasParado,
}: KanbanCardProps) {
  const horasParado = getHorasParado(lead);
  const isCritico = horasParado >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(colunaId);
  const isAlerta = horasParado >= 12 && horasParado < 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(colunaId);

  return (
    <div
      onClick={() => onClickLead(lead)}
      className={`p-4 rounded-xl border transition-all cursor-pointer group bg-white shadow-sm hover:shadow-md ${
        isCritico
          ? 'border-red-300 bg-red-50/50 hover:border-red-400'
          : isAlerta
          ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400'
          : 'border-slate-200 hover:border-blue-400'
      }`}
    >
      {/* NOME DO PACIENTE - FONTE MAIOR */}
      <div className="flex justify-between items-start mb-1.5 gap-2">
        <h4 className="font-bold text-slate-900 text-base md:text-lg group-hover:text-blue-600 transition-colors line-clamp-1">
          {lead.name || 'Sem Nome'}
        </h4>
        {lead.is_paused && (
          <span className="text-xs font-bold bg-slate-800 text-white px-2 py-0.5 rounded shrink-0 shadow-sm">
            Humano
          </span>
        )}
      </div>

      {/* TELEFONE - FONTE MAIOR */}
      <p className="text-sm font-semibold text-slate-500 mb-2">
        {formatarTelefone(lead.phone || lead.phone_number)}
      </p>

      {/* ORIGEM / PROMOTOR */}
      {lead.promotor && (
        <p className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md w-fit mb-2">
          👤 Origem: {lead.promotor}
        </p>
      )}

      {/* VALOR DA VENDA */}
      {lead.valor_venda && Number(lead.valor_venda) > 0 && (
        <div className="flex flex-col gap-1 mb-2.5 w-fit">
          <div className="flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
            💰 {formatarMoeda(lead.valor_venda)}
          </div>
          {lead.data_venda && (
            <div className="text-[11px] font-semibold text-emerald-600 bg-white border border-emerald-100 px-2 py-0.5 rounded shadow-sm w-fit">
              📅 Venda: {formatarDataCurta(lead.data_venda)}
            </div>
          )}
        </div>
      )}

      {/* BOX DE AGENDAMENTO - FONTE GRANDE E BEM VISÍVEL */}
      {lead.data_agendamento && (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg mb-3 w-full">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="truncate">Agendado: {formatarDataAgendamento(lead.data_agendamento)}</span>
        </div>
      )}

      {/* FOOTER DO CARD - UNIDADE E SLA */}
      <div className="flex justify-between items-center pt-2.5 border-t border-slate-100">
        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
          {lead.unidade && lead.unidade !== 'Pendente' ? lead.unidade : 'Sem Unidade'}
        </span>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
            isCritico
              ? 'bg-red-100 text-red-700'
              : isAlerta
              ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          {isCritico && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          {formatarTempoParado(horasParado)}
        </span>
      </div>
    </div>
  );
}