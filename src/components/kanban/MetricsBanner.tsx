// File: src/components/kanban/MetricsBanner.tsx

"use client";

import React from 'react';

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
  taxaAgendamento?: string;
  taxaConfirmacao?: string;
  taxaComparecimento?: string;
  taxaFechamento?: string;
  totalEstagnados?: number;
  formatarMoeda?: (val?: number | string | null) => string;
}

export default function MetricsBanner({
  leads = [],
  selectedUnit = 'all',
  dbMetrics = {
    total_leads: 0,
    agendados: 0,
    confirmados: 0,
    compareceram: 0,
    vendidos: 0,
    faturamento_total: 0,
  },
  taxaAgendamento = '0.0',
  taxaConfirmacao = '0.0',
  taxaComparecimento = '0.0',
  taxaFechamento = '0.0',
  totalEstagnados = 0,
  formatarMoeda = (val) => (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
}: MetricsBannerProps) {
  const safeLeads = Array.isArray(leads) ? leads : [];

  const leadsUnidade = safeLeads.filter((lead) => {
    if (!selectedUnit || selectedUnit === 'all' || selectedUnit === 'Todas' || selectedUnit === 'Todas as Unidades') {
      return true;
    }
    const leadUnit = lead?.unidade || lead?.unit || 'Sem Unidade';
    return leadUnit.toLowerCase() === selectedUnit.toLowerCase();
  });

  const totalLeads = dbMetrics.total_leads || leadsUnidade.length;
  const agendados = dbMetrics.agendados || leadsUnidade.filter((l) => l.status === 'agendado').length;
  const confirmados = dbMetrics.confirmados || leadsUnidade.filter((l) => l.status === 'confirmado').length;
  const compareceram = dbMetrics.compareceram || leadsUnidade.filter((l) => l.status === 'na_clinica').length;
  const vendidos = dbMetrics.vendidos || leadsUnidade.filter((l) => l.status === 'vendido').length;
  const faturamento = dbMetrics.faturamento_total || leadsUnidade.reduce((acc, l) => acc + (Number(l.valor_venda) || 0), 0);

  // FIX DAS PORCENTAGENS: Previne estouro (ex: 300%) ajustando a base quando agendados > totalLeads no filtro
  const baseCalculoAgendados = Math.max(totalLeads, agendados);
  const calcTaxaAgendamento = baseCalculoAgendados > 0 ? ((agendados / baseCalculoAgendados) * 100).toFixed(1) : '0.0';
  const calcTaxaConfirmacao = agendados > 0 ? (Math.min(100, (confirmados / agendados) * 100)).toFixed(1) : '0.0';
  const calcTaxaComparecimento = confirmados > 0 ? (Math.min(100, (compareceram / confirmados) * 100)).toFixed(1) : '0.0';
  const calcTaxaFechamento = compareceram > 0 ? (Math.min(100, (vendidos / compareceram) * 100)).toFixed(1) : '0.0';

  return (
    <div className="px-6 py-3.5 bg-slate-50/80 flex items-center justify-between gap-4 overflow-x-auto custom-scrollbar border-b border-slate-200/80">
      <div className="flex items-center gap-6 md:gap-8 shrink-0">
        
        {/* LEADS TOTAIS */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-slate-400"></div>
          <div>
            <span className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">Leads Totais</span>
            <span className="text-2xl font-black text-slate-800 leading-tight">{totalLeads}</span>
          </div>
        </div>

        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
        </svg>

        {/* AGENDADOS */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-indigo-600 uppercase tracking-wider">Agendados (IA)</span>
              <span className="text-xs font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{calcTaxaAgendamento}%</span>
            </div>
            <span className="text-2xl font-black text-indigo-600 leading-tight">{agendados}</span>
          </div>
        </div>

        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
        </svg>

        {/* CONFIRMADOS */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-emerald-600 uppercase tracking-wider">Confirmados</span>
              <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{calcTaxaConfirmacao}%</span>
            </div>
            <span className="text-2xl font-black text-emerald-600 leading-tight">{confirmados}</span>
          </div>
        </div>

        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
        </svg>

        {/* COMPARECERAM */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider">Na Clínica</span>
              <span className="text-xs font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{calcTaxaComparecimento}%</span>
            </div>
            <span className="text-2xl font-black text-amber-600 leading-tight">{compareceram}</span>
          </div>
        </div>

        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
        </svg>

        {/* VENDAS */}
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-teal-500"></div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-teal-600 uppercase tracking-wider">Vendas Fechadas</span>
              <span className="text-xs font-black bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{calcTaxaFechamento}%</span>
            </div>
            <span className="text-2xl font-black text-teal-600 leading-tight">{vendidos}</span>
          </div>
        </div>

        {/* FATURAMENTO */}
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="w-3.5 h-3.5 rounded-full bg-emerald-600 animate-pulse"></div>
          <div>
            <span className="block text-xs font-extrabold text-emerald-700 uppercase tracking-wider">Faturamento</span>
            <span className="text-2xl font-black text-emerald-600 leading-tight">{formatarMoeda(faturamento)}</span>
          </div>
        </div>
      </div>

      {/* SLA PARADO */}
      <div className="flex items-center gap-2 pl-4 border-l border-slate-200 shrink-0">
        <div className="flex flex-col items-end">
          <span className="text-xs font-extrabold text-red-500 uppercase tracking-wider flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            SLA Parado (+24h)
          </span>
          <span className="text-xl font-black text-red-600">{totalEstagnados}</span>
        </div>
      </div>
    </div>
  );
}