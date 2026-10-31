// File: src/components/kanban/KanbanAnalytics.tsx
"use client";

import React, { useMemo } from 'react';
import { parseDataSegura, getIsoDateBounds, formatarMoeda, isLeadWithinPeriod } from '../../utils/kanbanUtils';

interface KanbanAnalyticsProps {
  leadsNaUnidadeGlobal: any[];
  dateRange: string;
  customStart?: string;
  customEnd?: string;
  totalLeads?: number;
  dbMetrics?: {
    total_leads: number;
    agendados: number;
    confirmados: number;
    compareceram: number;
    vendidos: number;
    faturamento_total: number;
  };
}

export default function KanbanAnalytics({
  leadsNaUnidadeGlobal = [],
  dateRange,
  customStart = '',
  customEnd = '',
  dbMetrics,
}: KanbanAnalyticsProps) {

  // 1. FILTRAGEM TEMPORAL DOS LEADS (Coluna 'vendido' filtrada estritamente por data_venda no fuso SP)
  const leadsPeriodo = useMemo(() => {
    if (!Array.isArray(leadsNaUnidadeGlobal)) return [];
    if (dateRange === 'all') return leadsNaUnidadeGlobal;

    return leadsNaUnidadeGlobal.filter((lead) =>
      isLeadWithinPeriod(lead, dateRange, customStart, customEnd)
    );
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  // 2. FUNIL DE CONVERSÃO COMERCIAL DA CLÍNICA (SINCRO SUPABASE)
  const funil = useMemo(() => {
    const total = dbMetrics?.total_leads ?? leadsPeriodo.length;
    const agendados = dbMetrics?.agendados ?? leadsPeriodo.filter((l) => ['agendado', 'confirmado', 'na_clinica', 'vendido'].includes(l.status)).length;
    const confirmados = dbMetrics?.confirmados ?? leadsPeriodo.filter((l) => ['confirmado', 'na_clinica', 'vendido'].includes(l.status)).length;
    const compareceram = dbMetrics?.compareceram ?? leadsPeriodo.filter((l) => ['na_clinica', 'vendido'].includes(l.status)).length;
    const vendidos = dbMetrics?.vendidos ?? leadsPeriodo.filter((l) => l.status === 'vendido').length;
    const faturamentoTotal = dbMetrics?.faturamento_total ?? leadsPeriodo.filter((l) => l.status === 'vendido').reduce((acc, l) => acc + (Number(l.valor_venda) || 0), 0);

    const ticketMedio = vendidos > 0 ? faturamentoTotal / vendidos : 0;
    const taxaConversaoGlobal = total > 0 ? ((vendidos / total) * 100).toFixed(1) : '0.0';

    return {
      total,
      agendados,
      confirmados,
      compareceram,
      vendidos,
      faturamentoTotal,
      ticketMedio,
      taxaConversaoGlobal
    };
  }, [dbMetrics, leadsPeriodo]);

  // 3. DESEMPENHO DETERMINÍSTICO E SEM DIVERGÊNCIAS DA CHAMALARA (IA)
  const metricasLara = useMemo(() => {
    const totalAtendidos = funil.total;
    let totalAgendadosIA = 0;

    // Se for filtro diário ("Hoje" ou "Ontem"), calcula a conversão real das conversas do dia
    if (dateRange === 'today' || dateRange === 'yesterday') {
      const bounds = getIsoDateBounds(dateRange, customStart, customEnd);
      totalAgendadosIA = leadsNaUnidadeGlobal.filter((l) => {
        const st = (l.status || '').toLowerCase().trim();
        const isAgendado = ['agendado', 'confirmado', 'na_clinica', 'vendido'].includes(st);
        if (!isAgendado) return false;
        
        const createdMs = parseDataSegura(l.created_at);
        return createdMs >= bounds.startMs && createdMs <= bounds.endMs;
      }).length;
    } else {
      // Nos filtros acumulados ("Este Mês", "Todos"), utiliza a métrica exata da RPC do Supabase
      totalAgendadosIA = funil.agendados;
    }

    const taxaCalculada = totalAtendidos > 0 
      ? Math.min(100, (totalAgendadosIA / totalAtendidos) * 100).toFixed(1) 
      : '0.0';

    const transbordoHumano = leadsPeriodo.filter((l) => l.status_automacao === 'PAUSED' || l.motivo_pausa).length;

    return {
      totalAtendidos,
      totalAgendadosIA,
      taxaSucessoLara: taxaCalculada,
      transbordoHumano
    };
  }, [funil, leadsNaUnidadeGlobal, leadsPeriodo, dateRange, customStart, customEnd]);

  // 4. DEMANDA POR PROCEDIMENTO
  const demandasProcedimento = useMemo(() => {
    const mapa: Record<string, { quantidade: number; faturamento: number }> = {};

    leadsPeriodo.forEach((lead) => {
      let proc = lead.procedimento || lead.interesse || lead.treatment || 'Avaliação Geral';
      proc = proc.trim();
      if (proc.length < 3) proc = 'Avaliação Geral';

      if (!mapa[proc]) mapa[proc] = { quantidade: 0, faturamento: 0 };
      mapa[proc].quantidade += 1;
      if (lead.status === 'vendido') {
        mapa[proc].faturamento += Number(lead.valor_venda) || 0;
      }
    });

    const totalLeadsAnalise = funil.total || 1;
    const lista = Object.entries(mapa).map(([nome, dados]) => ({
      nome,
      quantidade: dados.quantidade,
      faturamento: dados.faturamento,
      porcentagem: ((dados.quantidade / totalLeadsAnalise) * 100).toFixed(1)
    }));

    return lista.sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
  }, [leadsPeriodo, funil.total]);

  // 5. BREAKDOWN POR UNIDADE
  const performanceUnidades = useMemo(() => {
    const mapa: Record<string, { leads: number; agendados: number; vendidos: number; faturamento: number }> = {};

    leadsPeriodo.forEach((lead) => {
      const uni = lead.unidade || lead.unit || 'Santo André';
      if (!mapa[uni]) mapa[uni] = { leads: 0, agendados: 0, vendidos: 0, faturamento: 0 };

      mapa[uni].leads += 1;
      if (['agendado', 'confirmado', 'na_clinica', 'vendido'].includes(lead.status)) mapa[uni].agendados += 1;
      if (lead.status === 'vendido') {
        mapa[uni].vendidos += 1;
        mapa[uni].faturamento += Number(lead.valor_venda) || 0;
      }
    });

    return Object.entries(mapa).map(([unidade, d]) => ({
      unidade,
      ...d,
      conversao: d.leads > 0 ? ((d.vendidos / d.leads) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.faturamento - a.faturamento);
  }, [leadsPeriodo]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 custom-scrollbar">
      
      {/* SEÇÃO 1: CARDS DE RESUMO EXECUTIVO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Faturamento Realizado</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-slate-900">{formatarMoeda(funil.faturamentoTotal)}</span>
            <span className="block text-xs font-semibold text-emerald-600 mt-1">
              {funil.vendidos} tratamentos fechados
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ticket Médio</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-slate-900">{formatarMoeda(funil.ticketMedio)}</span>
            <span className="block text-xs font-semibold text-slate-500 mt-1">Média por contrato fechado</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Conversão Global</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-slate-900">{funil.taxaConversaoGlobal}%</span>
            <span className="block text-xs font-semibold text-indigo-600 mt-1">Do Lead até a Venda</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total de Leads</span>
            <div className="p-2 bg-slate-100 text-slate-600 rounded-xl">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-slate-900">{funil.total}</span>
            <span className="block text-xs font-semibold text-slate-500 mt-1">Oportunidades no período</span>
          </div>
        </div>

      </div>

      {/* SEÇÃO 2: FUNIL DE CONVERSÃO COMERCIAL & PERFORMANCE DA IA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* FUNIL GRÁFICO (2 COLUNAS) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Funil de Conversão Comercial</h3>
              <p className="text-xs text-slate-500 font-medium">Jornada completa dos pacientes desde o primeiro contato</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
              {funil.total} Oportunidades
            </span>
          </div>

          <div className="space-y-3">
            
            {/* Etapa 1: Leads Recebidos */}
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                <span>1. Leads Recebidos</span>
                <span>{funil.total} (100%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-slate-400 rounded-full transition-all duration-500" style={{ width: '100%' }}></div>
              </div>
            </div>

            {/* Etapa 2: Agendados */}
            <div>
              <div className="flex justify-between text-xs font-bold text-indigo-700 mb-1">
                <span>2. Agendados (Agenda da Clínica)</span>
                <span>{funil.agendados} ({funil.total > 0 ? ((funil.agendados / funil.total) * 100).toFixed(1) : 0}%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.agendados / funil.total) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Etapa 3: Confirmados */}
            <div>
              <div className="flex justify-between text-xs font-bold text-emerald-700 mb-1">
                <span>3. Consultas Confirmadas</span>
                <span>{funil.confirmados} ({funil.agendados > 0 ? ((funil.confirmados / funil.agendados) * 100).toFixed(1) : 0}% dos agendados)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.confirmados / funil.total) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Etapa 4: Compareceram */}
            <div>
              <div className="flex justify-between text-xs font-bold text-amber-700 mb-1">
                <span>4. Compareceram à Clínica</span>
                <span>{funil.compareceram} ({funil.confirmados > 0 ? ((funil.compareceram / funil.confirmados) * 100).toFixed(1) : 0}% dos confirmados)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.compareceram / funil.total) * 100 : 0}%` }}></div>
              </div>
            </div>

            {/* Etapa 5: Vendas Fechadas */}
            <div>
              <div className="flex justify-between text-xs font-bold text-teal-700 mb-1">
                <span>5. Tratamento Fechado (Venda)</span>
                <span>{funil.vendidos} ({funil.compareceram > 0 ? ((funil.vendidos / funil.compareceram) * 100).toFixed(1) : 0}% na clínica)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.vendidos / funil.compareceram) * 100 : 0}%` }}></div>
              </div>
            </div>

          </div>
        </div>

        {/* CENTRAL DA LARA - DESEMPENHO REAL DA IA (1 COLUNA) */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                ChamaLara IA
              </span>
              <span className="text-xs text-indigo-300 font-semibold">Automação 24/7</span>
            </div>

            <h3 className="text-lg font-black text-white mt-4">Desempenho da Lara</h3>
            <p className="text-xs text-indigo-200 font-medium">Produtividade real da assistente no período</p>
          </div>

          <div className="grid grid-cols-2 gap-3 my-2">
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10">
              <span className="block text-[10px] font-bold uppercase text-indigo-200">Atendimentos</span>
              <span className="text-xl font-black text-white">{metricasLara.totalAtendidos}</span>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10">
              <span className="block text-[10px] font-bold uppercase text-indigo-200">Agendados pela IA</span>
              <span className="text-xl font-black text-emerald-400">{metricasLara.totalAgendadosIA}</span>
            </div>
          </div>

          <div className="space-y-2 bg-black/20 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-indigo-200 font-medium">Taxa de Conversão da Lara:</span>
              <span className="font-black text-emerald-400 text-sm">{metricasLara.taxaSucessoLara}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${metricasLara.taxaSucessoLara}%` }}></div>
            </div>
          </div>

          <div className="text-[11px] text-indigo-300 flex justify-between items-center pt-2 border-t border-white/10">
            <span>Transbordo para Humano:</span>
            <span className="font-bold text-white">{metricasLara.transbordoHumano} pacientes</span>
          </div>
        </div>

      </div>

      {/* SEÇÃO 3: DEMANDA POR PROCEDIMENTO & PERFORMANCE POR UNIDADE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* DEMANDA POR PROCEDIMENTO */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900">Demanda por Procedimento</h3>
            <p className="text-xs text-slate-500 font-medium">Tratamentos odontológicos mais procurados</p>
          </div>

          <div className="space-y-3">
            {demandasProcedimento.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhum dado registrado para o período.</p>
            ) : (
              demandasProcedimento.map((proc, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-800 truncate max-w-[220px]">{proc.nome}</span>
                    <span className="text-slate-500">{proc.quantidade} leads ({proc.porcentagem}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${proc.porcentagem}%` }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COMPARATIVO POR UNIDADE */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900">Performance por Unidade</h3>
            <p className="text-xs text-slate-500 font-medium">Comparativo comercial entre as clínicas da rede</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black uppercase text-slate-400">
                  <th className="pb-2">Unidade</th>
                  <th className="pb-2 text-center">Leads</th>
                  <th className="pb-2 text-center">Agend.</th>
                  <th className="pb-2 text-center">Vendas</th>
                  <th className="pb-2 text-right">Faturamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {performanceUnidades.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400 italic">Nenhum dado encontrado.</td>
                  </tr>
                ) : (
                  performanceUnidades.map((u, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 font-bold text-slate-900">{u.unidade}</td>
                      <td className="py-2.5 text-center text-slate-600">{u.leads}</td>
                      <td className="py-2.5 text-center text-indigo-600 font-bold">{u.agendados}</td>
                      <td className="py-2.5 text-center text-emerald-600 font-bold">{u.vendidos}</td>
                      <td className="py-2.5 text-right font-black text-slate-900">{formatarMoeda(u.faturamento)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
