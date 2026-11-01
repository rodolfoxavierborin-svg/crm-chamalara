// File: src/components/kanban/KanbanAnalytics.tsx
"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
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

interface ColaboradorMetrica {
  id: string;
  nome: string;
  cargo: string;
  unidade: string;
  isIA?: boolean;
  leadsAssumidos: number;
  agendamentos: number;
  confirmados: number;
  compareceram: number;
  vendas: number;
  faturamento: number;
  taxaConversao: string;
}

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function KanbanAnalytics({
  leadsNaUnidadeGlobal = [],
  dateRange,
  customStart = '',
  customEnd = '',
  dbMetrics,
}: KanbanAnalyticsProps) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // 0. BUSCAR MEMBROS DA EQUIPE (dentup_profiles)
  useEffect(() => {
    let isMounted = true;
    const carregarEquipe = async () => {
      try {
        setLoadingProfiles(true);
        const { data, error } = await supabase
          .from('dentup_profiles')
          .select('id, nome, email, cargo, unidade')
          .order('nome', { ascending: true });

        if (!error && data && isMounted) {
          setProfiles(data);
        }
      } catch (err) {
        console.error('Erro ao carregar colaboradores para o analytics:', err);
      } finally {
        if (isMounted) setLoadingProfiles(false);
      }
    };

    carregarEquipe();
    return () => { isMounted = false; };
  }, []);

  // 1. FILTRAGEM TEMPORAL DOS LEADS
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
    const agendados = dbMetrics?.agendados ?? leadsPeriodo.filter((l) => ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(l.status)).length;
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

  // 3. DESEMPENHO DETERMINÍSTICO DA CHAMALARA (IA)
  const metricasLara = useMemo(() => {
    const totalAtendidos = funil.total;
    let totalAgendadosIA = 0;

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
      totalAgendadosIA = leadsPeriodo.filter((l) => {
        const st = (l.status || '').toLowerCase().trim();
        const isAgendado = ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(st);
        if (!isAgendado) return false;
        const tipo = (l.tipo_agendamento || 'lara').toLowerCase().trim();
        return tipo !== 'clinica';
      }).length;
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
      if (['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(lead.status)) mapa[uni].agendados += 1;
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

  // =========================================================================
  // 6. MÉTRICAS INDIVIDUAIS DOS COLABORADORES + IA LARA
  // =========================================================================
  const metricasColaboradores = useMemo<ColaboradorMetrica[]>(() => {
    const mapa: Record<string, ColaboradorMetrica> = {};

    // 6.1 Inicializar a IA Lara
    mapa['lara_ia'] = {
      id: 'lara_ia',
      nome: 'Lara (IA Inteligência Artificial)',
      cargo: 'Inteligência Artificial',
      unidade: 'Todas',
      isIA: true,
      leadsAssumidos: leadsPeriodo.filter((l) => (l.status_automacao || 'ACTIVE') !== 'PAUSED' && !l.pausado_por).length,
      agendamentos: 0,
      confirmados: 0,
      compareceram: 0,
      vendas: 0,
      faturamento: 0,
      taxaConversao: '0.0',
    };

    // 6.2 Inicializar todos os membros cadastrados na equipe
    profiles.forEach((p) => {
      const chave = p.id || p.nome?.toLowerCase().trim() || p.email;
      mapa[chave] = {
        id: p.id,
        nome: p.nome || p.email || 'Colaborador',
        cargo: p.cargo || 'usuario',
        unidade: p.unidade || 'Todas',
        isIA: false,
        leadsAssumidos: 0,
        agendamentos: 0,
        confirmados: 0,
        compareceram: 0,
        vendas: 0,
        faturamento: 0,
        taxaConversao: '0.0',
      };
    });

    // 6.3 Atribuir leads do período
    leadsPeriodo.forEach((lead) => {
      const respId = lead.responsavel_id;
      const respNome = lead.responsavel_nome?.toLowerCase().trim();
      const agendadoPor = (lead.agendado_por || '').toLowerCase().trim();
      const tipoAgendamento = (lead.tipo_agendamento || '').toLowerCase().trim();
      const statusNorm = (lead.status || '').toLowerCase().trim();
      const isAgendado = ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(statusNorm);
      const isConfirmado = ['confirmado', 'na_clinica', 'vendido'].includes(statusNorm);
      const isCompareceu = ['na_clinica', 'vendido'].includes(statusNorm);
      const isVendido = statusNorm === 'vendido';
      const valorVenda = Number(lead.valor_venda) || 0;

      // Localizar o colaborador responsável
      let colaboradorKey: string | null = null;
      if (respId && mapa[respId]) {
        colaboradorKey = respId;
      } else if (respNome) {
        const found = Object.keys(mapa).find((k) => mapa[k].nome.toLowerCase().trim() === respNome);
        if (found) colaboradorKey = found;
      }

      // Se não encontrou por ID ou nome, mas tem responsável gravado avulso
      if (!colaboradorKey && respNome) {
        mapa[respNome] = {
          id: respNome,
          nome: lead.responsavel_nome,
          cargo: 'Colaborador',
          unidade: lead.unidade || 'Todas',
          isIA: false,
          leadsAssumidos: 0,
          agendamentos: 0,
          confirmados: 0,
          compareceram: 0,
          vendas: 0,
          faturamento: 0,
          taxaConversao: '0.0',
        };
        colaboradorKey = respNome;
      }

      // Contabiliza lead assumido pelo colaborador
      if (colaboradorKey && !mapa[colaboradorKey].isIA) {
        mapa[colaboradorKey].leadsAssumidos += 1;
        if (isConfirmado) mapa[colaboradorKey].confirmados += 1;
        if (isCompareceu) mapa[colaboradorKey].compareceram += 1;
        if (isVendido) {
          mapa[colaboradorKey].vendas += 1;
          mapa[colaboradorKey].faturamento += valorVenda;
        }
      }

      // Atribuição do agendamento (Lara vs Colaborador)
      if (isAgendado) {
        if (tipoAgendamento === 'clinica' || agendadoPor.includes('clínica') || agendadoPor.includes('clinica')) {
          // Agendado por humano
          let agendadorKey = colaboradorKey;
          if (agendadoPor) {
            const foundAgendador = Object.keys(mapa).find((k) => 
              mapa[k].nome.toLowerCase().trim().includes(agendadoPor) || agendadoPor.includes(mapa[k].nome.toLowerCase().trim())
            );
            if (foundAgendador) agendadorKey = foundAgendador;
          }

          if (agendadorKey && mapa[agendadorKey]) {
            mapa[agendadorKey].agendamentos += 1;
          } else if (colaboradorKey && mapa[colaboradorKey]) {
            mapa[colaboradorKey].agendamentos += 1;
          }
        } else {
          // Agendado pela Lara
          mapa['lara_ia'].agendamentos += 1;
          if (isConfirmado) mapa['lara_ia'].confirmados += 1;
          if (isCompareceu) mapa['lara_ia'].compareceram += 1;
          if (isVendido) {
            mapa['lara_ia'].vendas += 1;
            mapa['lara_ia'].faturamento += valorVenda;
          }
        }
      }
    });

    // 6.4 Calcular taxa de conversão final
    const listaFinal = Object.values(mapa).map((item) => {
      const base = item.isIA ? (item.leadsAssumidos || funil.total) : (item.leadsAssumidos || item.agendamentos);
      const taxa = base > 0 ? ((item.vendas / base) * 100).toFixed(1) : '0.0';
      return {
        ...item,
        taxaConversao: taxa
      };
    });

    return listaFinal;
  }, [leadsPeriodo, profiles, funil.total]);

  // =========================================================================
  // 7. RANKING GERAL DE AGENDAMENTOS (LEADERBOARD COM IA LARA)
  // =========================================================================
  const rankingAgendamentos = useMemo(() => {
    return [...metricasColaboradores]
      .filter((c) => c.agendamentos > 0 || c.leadsAssumidos > 0 || c.isIA)
      .sort((a, b) => b.agendamentos - a.agendamentos);
  }, [metricasColaboradores]);

  // =========================================================================
  // 8. COMPARATIVO TEMPORAL DOS ÚLTIMOS MESES (MoM - Month over Month)
  // =========================================================================
  const historicoMensal = useMemo(() => {
    const mapaMeses: Record<string, { chave: string; label: string; ano: number; mes: number; agendados: number; faturamento: number; vendas: number; leads: number }> = {};
    const hoje = new Date();

    // Gerar os últimos 6 meses estruturados
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const ano = d.getFullYear();
      const mes = d.getMonth();
      const chave = `${ano}-${String(mes + 1).padStart(2, '0')}`;
      const label = `${MESES_NOMES[mes]}/${String(ano).slice(2)}`;

      mapaMeses[chave] = {
        chave,
        label,
        ano,
        mes,
        agendados: 0,
        faturamento: 0,
        vendas: 0,
        leads: 0,
      };
    }

    // Distribuir todos os leads da unidade global nos seus respectivos meses de ocorrência
    leadsNaUnidadeGlobal.forEach((lead) => {
      // 1. Data de entrada do lead
      const dtCreated = parseDataSegura(lead.created_at);
      if (dtCreated > 0) {
        const d = new Date(dtCreated);
        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (mapaMeses[chave]) {
          mapaMeses[chave].leads += 1;
        }
      }

      // 2. Data de Agendamento
      const st = (lead.status || '').toLowerCase().trim();
      const isAgendado = ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(st);
      if (isAgendado) {
        const dtAgend = parseDataSegura(lead.data_agendamento_clinica || lead.data_agendamento || lead.created_at);
        if (dtAgend > 0) {
          const d = new Date(dtAgend);
          const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (mapaMeses[chave]) {
            mapaMeses[chave].agendados += 1;
          }
        }
      }

      // 3. Data de Venda / Faturamento
      if (st === 'vendido') {
        const dtVenda = parseDataSegura(lead.data_venda || lead.data_movimentacao || lead.created_at);
        if (dtVenda > 0) {
          const d = new Date(dtVenda);
          const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (mapaMeses[chave]) {
            mapaMeses[chave].vendas += 1;
            mapaMeses[chave].faturamento += Number(lead.valor_venda) || 0;
          }
        }
      }
    });

    const lista = Object.values(mapaMeses);

    // Calcular crescimento percentual mês contra mês (MoM)
    return lista.map((m, idx) => {
      const mesAnterior = idx > 0 ? lista[idx - 1] : null;
      let crescFaturamento = 0;
      let crescAgendamentos = 0;

      if (mesAnterior && mesAnterior.faturamento > 0) {
        crescFaturamento = ((m.faturamento - mesAnterior.faturamento) / mesAnterior.faturamento) * 100;
      }
      if (mesAnterior && mesAnterior.agendados > 0) {
        crescAgendamentos = ((m.agendados - mesAnterior.agendados) / mesAnterior.agendados) * 100;
      }

      return {
        ...m,
        crescFaturamento: Math.round(crescFaturamento),
        crescAgendamentos: Math.round(crescAgendamentos),
      };
    });
  }, [leadsNaUnidadeGlobal]);

  // Altura máxima para normalizar o gráfico em barras (SVG / HTML)
  const maxFaturamento = useMemo(() => {
    const max = Math.max(...historicoMensal.map((m) => m.faturamento), 1000);
    return max;
  }, [historicoMensal]);

  const maxAgendamentos = useMemo(() => {
    const max = Math.max(...historicoMensal.map((m) => m.agendados), 10);
    return max;
  }, [historicoMensal]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50 custom-scrollbar">
      
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

      {/* =========================================================================
          SEÇÃO NOVO 1: COMPARATIVO DOS ÚLTIMOS MESES (MoM) COM GRÁFICO VISUAL
          ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </span>
              <h3 className="text-base font-extrabold text-slate-900">Evolução dos Últimos Meses (Comparativo MoM)</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Desempenho histórico de Faturamento (R$) e Agendamentos realizados nos últimos 6 meses
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-blue-600"></span> Faturamento (R$)
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded bg-emerald-500"></span> Agendamentos
            </span>
          </div>
        </div>

        {/* GRÁFICO HISTÓRICO DE BARRAS / EVOLUÇÃO */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-4">
          {historicoMensal.map((m, idx) => {
            const pctFaturamento = Math.round((m.faturamento / maxFaturamento) * 100);
            const pctAgendamento = Math.round((m.agendados / maxAgendamentos) * 100);

            return (
              <div key={m.chave} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/60 flex flex-col justify-between hover:border-blue-300 transition-all">
                {/* Cabeçalho do Mês */}
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black uppercase text-slate-800">{m.label}</span>
                  {idx > 0 && m.crescFaturamento !== 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      m.crescFaturamento > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {m.crescFaturamento > 0 ? `+${m.crescFaturamento}%` : `${m.crescFaturamento}%`}
                    </span>
                  )}
                </div>

                {/* Barras Visuais */}
                <div className="h-32 flex items-end justify-center gap-2 py-2 border-b border-slate-200">
                  {/* Barra Faturamento */}
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[9px] font-bold text-blue-700 mb-1">{m.vendas}v</span>
                    <div 
                      className="w-full bg-blue-600 rounded-t-md transition-all duration-500 hover:bg-blue-700" 
                      style={{ height: `${Math.max(pctFaturamento, 6)}%` }}
                      title={`Faturamento: ${formatarMoeda(m.faturamento)} (${m.vendas} vendas)`}
                    ></div>
                  </div>

                  {/* Barra Agendamentos */}
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[9px] font-bold text-emerald-700 mb-1">{m.agendados}ag</span>
                    <div 
                      className="w-full bg-emerald-500 rounded-t-md transition-all duration-500 hover:bg-emerald-600" 
                      style={{ height: `${Math.max(pctAgendamento, 6)}%` }}
                      title={`Agendamentos: ${m.agendados}`}
                    ></div>
                  </div>
                </div>

                {/* Resumo Numérico do Mês */}
                <div className="mt-3 space-y-1 text-center">
                  <span className="block text-xs font-black text-slate-900 truncate" title={formatarMoeda(m.faturamento)}>
                    {formatarMoeda(m.faturamento)}
                  </span>
                  <div className="flex justify-between text-[11px] font-medium text-slate-500 pt-1 border-t border-slate-200/60">
                    <span>{m.agendados} agend.</span>
                    <span>{m.leads} leads</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SEÇÃO NOVO 2: RANKING GERAL DE AGENDAMENTOS (LEADERBOARD DA EQUIPE + LARA)
          ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </span>
              <h3 className="text-base font-extrabold text-slate-900">Ranking Geral de Agendamentos (Leaderboard)</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Disputa saudável de agendamentos entre a equipe humana e a Inteligência Artificial Lara
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
            🏆 Top Agendadores do Período
          </span>
        </div>

        {/* PÓDIO E CARDS DOS TOP 3 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rankingAgendamentos.slice(0, 3).map((item, index) => {
            const medalhas = ['🥇 1º Lugar', '🥈 2º Lugar', '🥉 3º Lugar'];
            const coresBorda = [
              'border-amber-300 bg-gradient-to-b from-amber-50/70 to-white',
              'border-slate-300 bg-gradient-to-b from-slate-50/70 to-white',
              'border-orange-300 bg-gradient-to-b from-orange-50/70 to-white'
            ];

            return (
              <div 
                key={item.id} 
                className={`p-4 rounded-xl border-2 shadow-sm flex flex-col justify-between ${coresBorda[index]} relative overflow-hidden`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    {medalhas[index]}
                  </span>
                  {item.isIA ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                      🤖 IA Automação
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                      👤 Atendente
                    </span>
                  )}
                </div>

                <div className="my-3">
                  <h4 className="text-base font-black text-slate-900 truncate">{item.nome}</h4>
                  <p className="text-xs text-slate-500 capitalize">{item.cargo} • Unidade: {item.unidade}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Agendamentos</span>
                    <span className="text-xl font-black text-slate-900">{item.agendamentos}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Vendas</span>
                    <span className="text-sm font-black text-emerald-600">{item.vendas} ({formatarMoeda(item.faturamento)})</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SEÇÃO NOVO 3: MÉTRICAS INDIVIDUAIS DOS COLABORADORES E IA LARA (TABELA DETALHADA)
          ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
              <h3 className="text-base font-extrabold text-slate-900">Produtividade Individual dos Colaboradores</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Acompanhamento de conversão, consultas confirmadas e faturamento gerado por atendente (incluindo IA Lara)
            </p>
          </div>
          {loadingProfiles && (
            <span className="text-xs font-semibold text-slate-400 animate-pulse">Atualizando equipe...</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-400">
                <th className="pb-3">Membro / Atendente</th>
                <th className="pb-3 text-center">Cargo / Função</th>
                <th className="pb-3 text-center">Unidade</th>
                <th className="pb-3 text-center">Atendimentos</th>
                <th className="pb-3 text-center">Agendados</th>
                <th className="pb-3 text-center">Confirmados</th>
                <th className="pb-3 text-center">Compareceram</th>
                <th className="pb-3 text-center">Vendas Fechadas</th>
                <th className="pb-3 text-right">Faturamento</th>
                <th className="pb-3 text-right">Conversão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {metricasColaboradores.map((m) => (
                <tr 
                  key={m.id} 
                  className={`hover:bg-slate-50/80 transition-colors ${
                    m.isIA ? 'bg-indigo-50/40 font-bold border-l-4 border-l-indigo-600' : ''
                  }`}
                >
                  <td className="py-3 font-bold text-slate-900 flex items-center gap-2">
                    {m.isIA ? (
                      <span className="p-1 bg-indigo-600 text-white rounded text-xs">🤖</span>
                    ) : (
                      <span className="p-1 bg-slate-200 text-slate-700 rounded text-xs">👤</span>
                    )}
                    <span className="truncate max-w-[200px]" title={m.nome}>{m.nome}</span>
                  </td>
                  <td className="py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      m.isIA ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {m.cargo}
                    </span>
                  </td>
                  <td className="py-3 text-center text-slate-500">{m.unidade}</td>
                  <td className="py-3 text-center font-bold text-slate-800">{m.leadsAssumidos}</td>
                  <td className="py-3 text-center font-black text-indigo-600">{m.agendamentos}</td>
                  <td className="py-3 text-center font-bold text-emerald-600">{m.confirmados}</td>
                  <td className="py-3 text-center font-bold text-amber-600">{m.compareceram}</td>
                  <td className="py-3 text-center font-black text-teal-600">{m.vendas}</td>
                  <td className="py-3 text-right font-black text-slate-900">{formatarMoeda(m.faturamento)}</td>
                  <td className="py-3 text-right font-black text-indigo-600">{m.taxaConversao}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEÇÃO 4: FUNIL DE CONVERSÃO COMERCIAL & PERFORMANCE DA IA */}
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

      {/* SEÇÃO 5: DEMANDA POR PROCEDIMENTO & PERFORMANCE POR UNIDADE */}
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
