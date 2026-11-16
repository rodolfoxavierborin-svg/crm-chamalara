// File: src/components/kanban/MetricsBanner.tsx

"use client";

import React, { useState } from 'react';
import { parseValorMonetario } from '../../utils/kanbanUtils';

interface MetricsBannerProps {
  leads?: any[];
  selectedUnit?: string;
  dbMetrics?: {
    total_leads: number;
    agendados: number;
    confirmados: number;
    compareceram: number;
    vendidos: number;
    faturamento_total: number;
  };
  totalEstagnados?: number;
  formatarMoeda?: (val?: number | string | null) => string;
}

export default function MetricsBanner({
  leads = [],
  selectedUnit = 'all',
  dbMetrics,
  totalEstagnados = 0,
  formatarMoeda = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
}: MetricsBannerProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const safeLeads = Array.isArray(leads) ? leads : [];

  // 1. FILTRAGEM DETERMINÍSTICA POR UNIDADE
  const leadsUnidade = safeLeads.filter((lead) => {
    if (!selectedUnit || selectedUnit === 'all' || selectedUnit === 'Todas' || selectedUnit === 'Todas as Unidades') {
      return true;
    }
    const leadUnit = lead?.unidade || lead?.unit || 'Sem Unidade';
    return leadUnit.toLowerCase() === selectedUnit.toLowerCase();
  });

  // 2. EXTRAÇÃO DAS MÉTRICAS (Sincronizadas com as colunas reais do Kanban)
  const totalLeads = dbMetrics?.total_leads ?? leadsUnidade.length;
  const agendados = dbMetrics?.agendados ?? leadsUnidade.filter((l) => {
    const s = (l.status || '').toLowerCase().trim();
    return s === 'agendado' || s === 'agendado_clinica';
  }).length;
  const confirmados = dbMetrics?.confirmados ?? leadsUnidade.filter((l) => (l.status || '').toLowerCase().trim() === 'confirmado').length;
  const compareceram = dbMetrics?.compareceram ?? leadsUnidade.filter((l) => (l.status || '').toLowerCase().trim() === 'na_clinica').length;
  const vendidos = dbMetrics?.vendidos ?? leadsUnidade.filter((l) => (l.status || '').toLowerCase().trim() === 'vendido').length;
  
  const faturamento = dbMetrics?.faturamento_total ?? leadsUnidade.reduce((acc, l) => {
    if ((l.status || '').toLowerCase().trim() === 'vendido') {
      return acc + parseValorMonetario(l.valor_venda);
    }
    return acc;
  }, 0);

  return (
    <div className="bg-slate-50/80 border-b border-slate-200/80">
      {/* RESUMO COMPACTO MOBILE (EXPANSÍVEL PARA ECONOMIZAR TELA) */}
      <div className="md:hidden px-3 py-2">
        <button
          type="button"
          onClick={() => setMobileExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-[11px] font-bold text-slate-500">Leads:</span>
              <span className="text-xs font-black text-slate-800">{totalLeads}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-[11px] font-bold text-indigo-600">Agend:</span>
              <span className="text-xs font-black text-indigo-700">{agendados}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="text-xs font-black text-emerald-700">{formatarMoeda(faturamento)}</span>
            </div>
            {totalEstagnados > 0 && (
              <div className="flex items-center gap-1 shrink-0 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black text-red-600">{totalEstagnados} SLA</span>
              </div>
            )}
          </div>
          <span className="text-[11px] font-bold text-blue-600 shrink-0 flex items-center gap-0.5">
            <span>{mobileExpanded ? 'Ocultar' : 'Funil'}</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${mobileExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {mobileExpanded && (
          <div className="grid grid-cols-3 gap-2 pt-2.5 mt-2 border-t border-slate-200/80">
            <div className="bg-white p-2 rounded-lg border border-slate-200/70">
              <span className="block text-[9px] font-extrabold text-slate-500 uppercase">Leads Totais</span>
              <span className="text-base font-black text-slate-800">{totalLeads}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-indigo-100">
              <span className="block text-[9px] font-extrabold text-indigo-600 uppercase">Agendados</span>
              <span className="text-base font-black text-indigo-600">{agendados}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-emerald-100">
              <span className="block text-[9px] font-extrabold text-emerald-600 uppercase">Confirmados</span>
              <span className="text-base font-black text-emerald-600">{confirmados}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-amber-100">
              <span className="block text-[9px] font-extrabold text-amber-600 uppercase">Na Clínica</span>
              <span className="text-base font-black text-amber-600">{compareceram}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-teal-100">
              <span className="block text-[9px] font-extrabold text-teal-600 uppercase">Vendas</span>
              <span className="text-base font-black text-teal-600">{vendidos}</span>
            </div>
            <div className="bg-white p-2 rounded-lg border border-red-100">
              <span className="block text-[9px] font-extrabold text-red-500 uppercase">SLA +24h</span>
              <span className="text-base font-black text-red-600">{totalEstagnados}</span>
            </div>
            <div className="col-span-3 bg-emerald-50/70 p-2 rounded-lg border border-emerald-200 flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-emerald-800 uppercase">Faturamento no Período</span>
              <span className="text-sm font-black text-emerald-700">{formatarMoeda(faturamento)}</span>
            </div>
          </div>
        )}
      </div>

      {/* VERSÃO DESKTOP ORIGINAL */}
      <div className="hidden md:flex px-5 py-2.5 items-center justify-between gap-4 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-5 md:gap-7 shrink-0">
          
          {/* LEADS TOTAIS */}
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
            <div>
              <span className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Leads Totais</span>
              <span className="text-xl font-black text-slate-800 leading-tight">{totalLeads}</span>
            </div>
          </div>

          <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>

          {/* AGENDADOS */}
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
            <div>
              <span className="block text-[11px] font-extrabold text-indigo-600 uppercase tracking-wider">Agendados</span>
              <span className="text-xl font-black text-indigo-600 leading-tight">{agendados}</span>
            </div>
          </div>

          <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>

          {/* CONFIRMADOS */}
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            <div>
              <span className="block text-[11px] font-extrabold text-emerald-600 uppercase tracking-wider">Confirmados</span>
              <span className="text-xl font-black text-emerald-600 leading-tight">{confirmados}</span>
            </div>
          </div>

          <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>

          {/* COMPARECERAM */}
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
            <div>
              <span className="block text-[11px] font-extrabold text-amber-600 uppercase tracking-wider">Na Clínica</span>
              <span className="text-xl font-black text-amber-600 leading-tight">{compareceram}</span>
            </div>
          </div>

          <svg className="w-3.5 h-3.5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>

          {/* VENDAS FECHADAS */}
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div>
            <div>
              <span className="block text-[11px] font-extrabold text-teal-600 uppercase tracking-wider">Vendas Fechadas</span>
              <span className="text-xl font-black text-teal-600 leading-tight">{vendidos}</span>
            </div>
          </div>

          {/* FATURAMENTO */}
          <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200">
            <div className="w-3 h-3 rounded-full bg-emerald-600 animate-pulse"></div>
            <div>
              <span className="block text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">Faturamento</span>
              <span className="text-xl font-black text-emerald-600 leading-tight">{formatarMoeda(faturamento)}</span>
            </div>
          </div>
        </div>

        {/* SLA PARADO */}
        <div className="flex items-center gap-2 pl-4 border-l border-slate-200 shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-extrabold text-red-500 uppercase tracking-wider flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              SLA Parado (+24h)
            </span>
            <span className="text-xl font-black text-red-600 leading-tight">{totalEstagnados}</span>
          </div>
        </div>
      </div>
    </div>
  );
}