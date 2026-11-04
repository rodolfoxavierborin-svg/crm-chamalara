// File: src/components/kanban/KanbanAnalytics.tsx
"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  parseDataSegura,
  formatarMoeda,
  isLeadWithinPeriod,
  parseValorMonetario,
  isLeadAgendadoPelaLara,
  obterVoucherDoLead
} from '../../utils/kanbanUtils';
import { toDateStrSP } from '../../utils/dateUtils';

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

interface AgendadorMetrica {
  id: string;
  nome: string;
  cargo: string;
  unidade: string;
  isIA: boolean;
  agendamentos: number;
  vouchersEmitidos: number;
  comparecimentos: number;
  vendasOriginadas: number;
  faturamentoOriginado: number;
}

interface CloserMetrica {
  id: string;
  nome: string;
  cargo: string;
  unidade: string;
  vendasFechadas: number;
  vendasDeLara: number;
  vendasDeClinica: number;
  faturamentoFechado: number;
  ticketMedio: number;
}

const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function KanbanAnalytics({
  leadsNaUnidadeGlobal = [],
  dateRange,
  customStart = '',
  customEnd = '',
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

  // 2. FUNIL DE CONVERSÃO COMERCIAL DA CLÍNICA (DETERMINÍSTICO VIA LEADS DO PERÍODO)
  const funil = useMemo(() => {
    const total = leadsPeriodo.length;
    const agendados = leadsPeriodo.filter((l) =>
      ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes((l.status || '').toLowerCase().trim())
    ).length;
    const confirmados = leadsPeriodo.filter((l) =>
      ['confirmado', 'na_clinica', 'vendido'].includes((l.status || '').toLowerCase().trim())
    ).length;
    const compareceram = leadsPeriodo.filter((l) =>
      ['na_clinica', 'vendido'].includes((l.status || '').toLowerCase().trim())
    ).length;
    const vendidos = leadsPeriodo.filter((l) => (l.status || '').toLowerCase().trim() === 'vendido').length;
    const faturamentoTotal = leadsPeriodo
      .filter((l) => (l.status || '').toLowerCase().trim() === 'vendido')
      .reduce((acc, l) => acc + parseValorMonetario(l.valor_venda), 0);

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
  }, [leadsPeriodo]);

  // 3. DEMANDA POR PROCEDIMENTO
  const demandasProcedimento = useMemo(() => {
    const mapa: Record<string, { quantidade: number; faturamento: number }> = {};

    leadsPeriodo.forEach((lead) => {
      let proc = lead.procedimento || lead.interesse || lead.treatment || 'Avaliação Geral';
      proc = proc.trim();
      if (proc.length < 3) proc = 'Avaliação Geral';

      if (!mapa[proc]) mapa[proc] = { quantidade: 0, faturamento: 0 };
      mapa[proc].quantidade += 1;
      if ((lead.status || '').toLowerCase().trim() === 'vendido') {
        mapa[proc].faturamento += parseValorMonetario(lead.valor_venda);
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

  // 4. BREAKDOWN POR UNIDADE
  const performanceUnidades = useMemo(() => {
    const mapa: Record<string, { leads: number; agendados: number; vendidos: number; faturamento: number }> = {};

    leadsPeriodo.forEach((lead) => {
      const uni = lead.unidade || lead.unit || 'Santo André';
      if (!mapa[uni]) mapa[uni] = { leads: 0, agendados: 0, vendidos: 0, faturamento: 0 };

      const st = (lead.status || '').toLowerCase().trim();
      mapa[uni].leads += 1;
      if (['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(st)) {
        mapa[uni].agendados += 1;
      }
      if (st === 'vendido') {
        mapa[uni].vendidos += 1;
        mapa[uni].faturamento += parseValorMonetario(lead.valor_venda);
      }
    });

    return Object.entries(mapa).map(([unidade, d]) => ({
      unidade,
      ...d,
      conversao: d.leads > 0 ? ((d.vendidos / d.leads) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.faturamento - a.faturamento);
  }, [leadsPeriodo]);

  // =========================================================================
  // 5. QUADRO 1: PERFORMANCE DE AGENDAMENTOS & CAPTAÇÃO (SDR: LARA VS RECEPÇÃO)
  // =========================================================================
  const metricasAgendadores = useMemo<AgendadorMetrica[]>(() => {
    const mapa: Record<string, AgendadorMetrica> = {};

    // 5.1 Inicializar IA Lara (Blindada por Voucher VIP e tipo_agendamento)
    mapa['lara_ia'] = {
      id: 'lara_ia',
      nome: 'Lara (IA Inteligência Artificial)',
      cargo: 'Inteligência Artificial',
      unidade: 'Todas',
      isIA: true,
      agendamentos: 0,
      vouchersEmitidos: 0,
      comparecimentos: 0,
      vendasOriginadas: 0,
      faturamentoOriginado: 0,
    };

    // 5.2 Inicializar membros humanos da equipe
    profiles.forEach((p) => {
      const chave = p.id || p.nome?.toLowerCase().trim() || p.email;
      mapa[chave] = {
        id: p.id,
        nome: p.nome || p.email || 'Colaborador',
        cargo: p.cargo || 'usuario',
        unidade: p.unidade || 'Todas',
        isIA: false,
        agendamentos: 0,
        vouchersEmitidos: 0,
        comparecimentos: 0,
        vendasOriginadas: 0,
        faturamentoOriginado: 0,
      };
    });

    // 5.3 Recepção Geral (para agendamentos de clínica sem nome individual vinculado)
    mapa['recepcao_geral'] = {
      id: 'recepcao_geral',
      nome: 'Recepção Geral / Clínica',
      cargo: 'Recepção',
      unidade: 'Todas',
      isIA: false,
      agendamentos: 0,
      vouchersEmitidos: 0,
      comparecimentos: 0,
      vendasOriginadas: 0,
      faturamentoOriginado: 0,
    };

    leadsPeriodo.forEach((lead) => {
      const statusNorm = (lead.status || '').toLowerCase().trim();
      const isAgendado = ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(statusNorm);
      if (!isAgendado) return;

      const isCompareceu = ['na_clinica', 'vendido'].includes(statusNorm);
      const isVendido = statusNorm === 'vendido';
      const valorVenda = parseValorMonetario(lead.valor_venda);
      const agendadoPorLara = isLeadAgendadoPelaLara(lead);

      if (agendadoPorLara) {
        // Mérito 100% blindado para a IA Lara
        mapa['lara_ia'].agendamentos += 1;
        if (obterVoucherDoLead(lead)) {
          mapa['lara_ia'].vouchersEmitidos += 1;
        }
        if (isCompareceu) {
          mapa['lara_ia'].comparecimentos += 1;
        }
        if (isVendido) {
          mapa['lara_ia'].vendasOriginadas += 1;
          mapa['lara_ia'].faturamentoOriginado += valorVenda;
        }
      } else {
        // Agendado manualmente pela Clínica / Recepção
        const agendadoPorTexto = (lead.agendado_por || '').toLowerCase().trim();
        const respNome = (lead.responsavel_nome || '').toLowerCase().trim();
        const respId = lead.responsavel_id;

        let agendadorKey: string | null = null;

        // 1º Tenta localizar pelo campo agendado_por
        if (agendadoPorTexto && !['recepção', 'recepcao', 'clínica', 'clinica'].includes(agendadoPorTexto)) {
          const foundByAgendador = Object.keys(mapa).find(
            (k) =>
              !mapa[k].isIA &&
              (mapa[k].nome.toLowerCase().trim() === agendadoPorTexto ||
                mapa[k].nome.toLowerCase().trim().includes(agendadoPorTexto) ||
                agendadoPorTexto.includes(mapa[k].nome.toLowerCase().trim()))
          );
          if (foundByAgendador) agendadorKey = foundByAgendador;
        }

        // 2º Fallback para responsável do cadastro se for agendamento da clínica
        if (!agendadorKey && respId && mapa[respId]) {
          agendadorKey = respId;
        } else if (!agendadorKey && respNome) {
          const foundByResp = Object.keys(mapa).find(
            (k) => !mapa[k].isIA && (mapa[k].nome.toLowerCase().trim() === respNome || respNome.includes(mapa[k].nome.toLowerCase().trim()))
          );
          if (foundByResp) {
            agendadorKey = foundByResp;
          } else if (lead.responsavel_nome) {
            mapa[respNome] = {
              id: respNome,
              nome: lead.responsavel_nome,
              cargo: 'Colaborador',
              unidade: lead.unidade || 'Todas',
              isIA: false,
              agendamentos: 0,
              vouchersEmitidos: 0,
              comparecimentos: 0,
              vendasOriginadas: 0,
              faturamentoOriginado: 0,
            };
            agendadorKey = respNome;
          }
        }

        if (!agendadorKey) {
          agendadorKey = 'recepcao_geral';
        }

        mapa[agendadorKey].agendamentos += 1;
        if (isCompareceu) {
          mapa[agendadorKey].comparecimentos += 1;
        }
        if (isVendido) {
          mapa[agendadorKey].vendasOriginadas += 1;
          mapa[agendadorKey].faturamentoOriginado += valorVenda;
        }
      }
    });

    if (mapa['recepcao_geral'].agendamentos === 0) {
      delete mapa['recepcao_geral'];
    }

    return Object.values(mapa).sort((a, b) => {
      if (a.isIA) return -1;
      if (b.isIA) return 1;
      if (b.agendamentos !== a.agendamentos) return b.agendamentos - a.agendamentos;
      return b.faturamentoOriginado - a.faturamentoOriginado;
    });
  }, [leadsPeriodo, profiles]);

  // =========================================================================
  // 6. QUADRO 2: FECHAMENTO COMERCIAL NA CLÍNICA (CLOSERS / VENDEDORES)
  // =========================================================================
  const metricasClosers = useMemo<CloserMetrica[]>(() => {
    const mapa: Record<string, CloserMetrica> = {};

    // Inicializar colaboradores humanos da clínica
    profiles.forEach((p) => {
      const chave = p.id || p.nome?.toLowerCase().trim() || p.email;
      mapa[chave] = {
        id: p.id,
        nome: p.nome || p.email || 'Colaborador',
        cargo: p.cargo || 'usuario',
        unidade: p.unidade || 'Todas',
        vendasFechadas: 0,
        vendasDeLara: 0,
        vendasDeClinica: 0,
        faturamentoFechado: 0,
        ticketMedio: 0,
      };
    });

    // Inicializar Equipe da Recepção / Clínicas para vendas sem closer individual
    mapa['equipe_geral'] = {
      id: 'equipe_geral',
      nome: 'Equipe da Recepção / Clínicas',
      cargo: 'Recepção / Clínica',
      unidade: 'Todas',
      vendasFechadas: 0,
      vendasDeLara: 0,
      vendasDeClinica: 0,
      faturamentoFechado: 0,
      ticketMedio: 0,
    };

    leadsPeriodo.forEach((lead) => {
      const statusNorm = (lead.status || '').toLowerCase().trim();
      if (statusNorm !== 'vendido') return;

      const valorVenda = parseValorMonetario(lead.valor_venda);
      const veioDaLara = isLeadAgendadoPelaLara(lead);

      // Prioridade estrita para vendedor_id / vendedor_nome (com fallback para responsavel_id/nome em vendas históricas)
      const vendId = lead.vendedor_id || lead.responsavel_id;
      const vendNomeRaw = lead.vendedor_nome || lead.responsavel_nome || '';
      const vendNomeNorm = vendNomeRaw.toLowerCase().trim();

      let closerKey: string | null = null;

      if (vendNomeNorm === 'equipe da recepção / clínicas' || vendNomeNorm === 'equipe geral') {
        closerKey = 'equipe_geral';
      } else if (vendId && mapa[vendId]) {
        closerKey = vendId;
      } else if (vendNomeNorm) {
        const found = Object.keys(mapa).find(
          (k) => mapa[k].nome.toLowerCase().trim() === vendNomeNorm
        );
        if (found) {
          closerKey = found;
        } else {
          mapa[vendNomeNorm] = {
            id: vendNomeNorm,
            nome: vendNomeRaw,
            cargo: 'Colaborador',
            unidade: lead.unidade || 'Todas',
            vendasFechadas: 0,
            vendasDeLara: 0,
            vendasDeClinica: 0,
            faturamentoFechado: 0,
            ticketMedio: 0,
          };
          closerKey = vendNomeNorm;
        }
      } else {
        closerKey = 'equipe_geral';
      }

      if (closerKey && mapa[closerKey]) {
        mapa[closerKey].vendasFechadas += 1;
        mapa[closerKey].faturamentoFechado += valorVenda;
        if (veioDaLara) {
          mapa[closerKey].vendasDeLara += 1;
        } else {
          mapa[closerKey].vendasDeClinica += 1;
        }
      }
    });

    if (mapa['equipe_geral'].vendasFechadas === 0) {
      delete mapa['equipe_geral'];
    }

    const lista = Object.values(mapa).map((c) => ({
      ...c,
      ticketMedio: c.vendasFechadas > 0 ? c.faturamentoFechado / c.vendasFechadas : 0,
    }));

    return lista.sort((a, b) => {
      if (b.faturamentoFechado !== a.faturamentoFechado) {
        return b.faturamentoFechado - a.faturamentoFechado;
      }
      return b.vendasFechadas - a.vendasFechadas;
    });
  }, [leadsPeriodo, profiles]);

  // =========================================================================
  // 7. RANKING GERAL DE AGENDAMENTOS (LEADERBOARD TOP 3 COM IA LARA)
  // =========================================================================
  const rankingAgendamentos = useMemo(() => {
    return [...metricasAgendadores]
      .filter((c) => c.agendamentos > 0 || c.vendasOriginadas > 0 || c.isIA)
      .sort((a, b) => b.agendamentos - a.agendamentos);
  }, [metricasAgendadores]);

  // =========================================================================
  // 8. COMPARATIVO TEMPORAL DOS ÚLTIMOS MESES (MoM - Month over Month)
  // =========================================================================
  const historicoMensal = useMemo(() => {
    const mapaMeses: Record<string, { chave: string; label: string; ano: number; mes: number; agendados: number; faturamento: number; vendas: number; leads: number }> = {};

    const now = new Date();
    const spNowStr = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const [spYear, spMonth] = spNowStr.split('-').map(Number);

    for (let i = 5; i >= 0; i--) {
      const d = new Date(spYear, spMonth - 1 - i, 1);
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

    leadsNaUnidadeGlobal.forEach((lead) => {
      const dtCreated = parseDataSegura(lead.created_at);
      if (dtCreated > 0) {
        const chave = toDateStrSP(dtCreated).slice(0, 7);
        if (mapaMeses[chave]) {
          mapaMeses[chave].leads += 1;
        }
      }

      const st = (lead.status || '').toLowerCase().trim();
      const isAgendado = ['agendado', 'agendado_clinica', 'confirmado', 'na_clinica', 'vendido'].includes(st);
      if (isAgendado) {
        const dtAgend = parseDataSegura(lead.data_agendamento_clinica || lead.data_agendamento || lead.created_at);
        if (dtAgend > 0) {
          const chave = toDateStrSP(dtAgend).slice(0, 7);
          if (mapaMeses[chave]) {
            mapaMeses[chave].agendados += 1;
          }
        }
      }

      if (st === 'vendido') {
        const dtVenda = parseDataSegura(lead.data_venda || lead.data_movimentacao || lead.created_at);
        if (dtVenda > 0) {
          const chave = toDateStrSP(dtVenda).slice(0, 7);
          if (mapaMeses[chave]) {
            mapaMeses[chave].vendas += 1;
            mapaMeses[chave].faturamento += parseValorMonetario(lead.valor_venda);
          }
        }
      }
    });

    const lista = Object.values(mapaMeses);

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

  const maxFaturamento = useMemo(() => {
    return Math.max(...historicoMensal.map((m) => m.faturamento), 1000);
  }, [historicoMensal]);

  const maxAgendamentos = useMemo(() => {
    return Math.max(...historicoMensal.map((m) => m.agendados), 10);
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
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">ROI Originado pela IA Lara</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <span className="text-base">🤖</span>
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-black text-indigo-700">
              {formatarMoeda(metricasAgendadores.find((a) => a.isIA)?.faturamentoOriginado || 0)}
            </span>
            <span className="block text-xs font-semibold text-indigo-600 mt-1">
              {metricasAgendadores.find((a) => a.isIA)?.vendasOriginadas || 0} vendas vieram de agendamentos da Lara
            </span>
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
          SEÇÃO 2: COMPARATIVO DOS ÚLTIMOS MESES (MoM) COM GRÁFICO VISUAL
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

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-4">
          {historicoMensal.map((m, idx) => {
            const pctFaturamento = Math.round((m.faturamento / maxFaturamento) * 100);
            const pctAgendamento = Math.round((m.agendados / maxAgendamentos) * 100);

            return (
              <div key={m.chave} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/60 flex flex-col justify-between hover:border-blue-300 transition-all">
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

                <div className="h-32 flex items-end justify-center gap-2 py-2 border-b border-slate-200">
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[9px] font-bold text-blue-700 mb-1">{m.vendas}v</span>
                    <div 
                      className="w-full bg-blue-600 rounded-t-md transition-all duration-500 hover:bg-blue-700" 
                      style={{ height: `${Math.max(pctFaturamento, 6)}%` }}
                      title={`Faturamento: ${formatarMoeda(m.faturamento)} (${m.vendas} vendas)`}
                    ></div>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[9px] font-bold text-emerald-700 mb-1">{m.agendados}ag</span>
                    <div 
                      className="w-full bg-emerald-500 rounded-t-md transition-all duration-500 hover:bg-emerald-600" 
                      style={{ height: `${Math.max(pctAgendamento, 6)}%` }}
                      title={`Agendamentos: ${m.agendados}`}
                    ></div>
                  </div>
                </div>

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
          SEÇÃO 3: RANKING GERAL DE AGENDAMENTOS (LEADERBOARD TOP 3)
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
              <h3 className="text-base font-extrabold text-slate-900">Pódio de Agendamentos (Top Captação)</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Líderes em trazer pacientes agendados para dentro da clínica (IA Lara + Recepção)
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
            🏆 Top Agendadores do Período
          </span>
        </div>

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
                      🤖 IA Automação (Voucher VIP)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                      👤 Recepção / Clínica
                    </span>
                  )}
                </div>

                <div className="my-3">
                  <h4 className="text-base font-black text-slate-900 truncate">{item.nome}</h4>
                  <p className="text-xs text-slate-500 capitalize">{item.cargo} • Unidade: {item.unidade}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Agendados</span>
                    <span className="text-xl font-black text-indigo-700">{item.agendamentos}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-bold text-slate-400">
                      Receita Originada (ROI)
                    </span>
                    <span className="text-sm font-black text-emerald-600">
                      {item.vendasOriginadas} vendas ({formatarMoeda(item.faturamentoOriginado)})
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          QUADRO 1 (PRÉ-VENDA / SDR): PERFORMANCE DE AGENDAMENTOS & ORIGINAÇÃO
          ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-indigo-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-sm">
                📅
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                Quadro 1: Performance de Agendamentos & Captação (Pré-Venda / SDR)
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Mede quem agendou o paciente e quanto faturamento esses agendamentos geraram para a clínica (Blindado por Voucher VIP)
            </p>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
            🔒 Mérito de Agendamento Protegido
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-400">
                <th className="pb-3">Canal / Agendador (SDR)</th>
                <th className="pb-3 text-center">Função</th>
                <th className="pb-3 text-center">Unidade</th>
                <th className="pb-3 text-center">Pacientes Agendados</th>
                <th className="pb-3 text-center">Compareceram</th>
                <th className="pb-3 text-center">Vendas Originadas</th>
                <th className="pb-3 text-right">Faturamento Originado (ROI)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {metricasAgendadores.map((m) => (
                <tr 
                  key={m.id} 
                  className={`hover:bg-slate-50/80 transition-colors ${
                    m.isIA ? 'bg-indigo-50/50 font-bold border-l-4 border-l-indigo-600' : ''
                  }`}
                >
                  <td className="py-3.5 font-bold text-slate-900 flex items-center gap-2">
                    {m.isIA ? (
                      <span className="p-1 bg-indigo-600 text-white rounded text-xs">🤖</span>
                    ) : (
                      <span className="p-1 bg-slate-200 text-slate-700 rounded text-xs">👤</span>
                    )}
                    <div>
                      <span className="truncate max-w-[210px] block" title={m.nome}>{m.nome}</span>
                      {m.isIA && m.vouchersEmitidos > 0 && (
                        <span className="text-[10px] text-indigo-600 font-bold">
                          🎟️ {m.vouchersEmitidos} Vouchers VIP ativos
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      m.isIA ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {m.cargo}
                    </span>
                  </td>
                  <td className="py-3.5 text-center text-slate-500">{m.unidade}</td>
                  <td className="py-3.5 text-center font-black text-indigo-700 text-sm">{m.agendamentos}</td>
                  <td className="py-3.5 text-center font-bold text-amber-700">{m.comparecimentos}</td>
                  <td className="py-3.5 text-center font-black text-teal-700">{m.vendasOriginadas}</td>
                  <td className="py-3.5 text-right font-black text-emerald-700 text-sm">
                    {formatarMoeda(m.faturamentoOriginado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          QUADRO 2 (FECHAMENTO NA CLÍNICA / CLOSERS): PRODUTIVIDADE COMERCIAL PRESENCIAL
          ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-emerald-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg font-bold text-sm">
                💼
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                Quadro 2: Fechamento Comercial na Clínica (Vendedores / Closers)
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Mede quem atendeu presencialmente na clínica e fechou o contrato financeiro (sem alterar o mérito de quem agendou)
            </p>
          </div>
          {loadingProfiles ? (
            <span className="text-xs font-semibold text-slate-400 animate-pulse">Atualizando equipe...</span>
          ) : (
            <span className="text-[11px] font-bold px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
              💰 Conversão Presencial na Clínica
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-400">
                <th className="pb-3">Vendedor / Closer (Na Clínica)</th>
                <th className="pb-3 text-center">Cargo / Função</th>
                <th className="pb-3 text-center">Unidade</th>
                <th className="pb-3 text-center">Vendas Fechadas</th>
                <th className="pb-3 text-center">Origem dos Pacientes</th>
                <th className="pb-3 text-right">Ticket Médio</th>
                <th className="pb-3 text-right">Faturamento Fechado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {metricasClosers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 font-bold text-slate-900 flex items-center gap-2">
                    <span className="p-1 bg-emerald-100 text-emerald-800 rounded text-xs">💼</span>
                    <span className="truncate max-w-[200px]" title={c.nome}>{c.nome}</span>
                  </td>
                  <td className="py-3.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                      {c.cargo}
                    </span>
                  </td>
                  <td className="py-3.5 text-center text-slate-500">{c.unidade}</td>
                  <td className="py-3.5 text-center font-black text-teal-700 text-sm">{c.vendasFechadas}</td>
                  <td className="py-3.5 text-center">
                    {c.vendasFechadas === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                        {c.vendasDeLara > 0 && (
                          <span
                            className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold"
                            title="Pacientes agendados originalmente pela IA Lara"
                          >
                            🤖 {c.vendasDeLara} da Lara
                          </span>
                        )}
                        {c.vendasDeClinica > 0 && (
                          <span
                            className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold"
                            title="Pacientes agendados pela própria Clínica/Recepção"
                          >
                            🏥 {c.vendasDeClinica} da Clínica
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 text-right font-semibold text-slate-600">
                    {formatarMoeda(c.ticketMedio)}
                  </td>
                  <td className="py-3.5 text-right font-black text-slate-900 text-sm">
                    {formatarMoeda(c.faturamentoFechado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEÇÃO 4: FUNIL DE CONVERSÃO COMERCIAL */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </span>
              <h3 className="text-base font-extrabold text-slate-900">Funil de Conversão Comercial</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">Jornada completa dos pacientes desde o primeiro contato até o fechamento</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
              {funil.total} Oportunidades
            </span>
            <span className="text-xs font-bold px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full">
              {funil.vendidos} Vendas Fechadas
            </span>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          
          <div>
            <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
              <span>1. Leads Recebidos</span>
              <span>{funil.total} (100%)</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-slate-400 rounded-full transition-all duration-500" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-indigo-700 mb-1.5">
              <span>2. Agendados (Agenda da Clínica)</span>
              <span>{funil.agendados} ({funil.total > 0 ? ((funil.agendados / funil.total) * 100).toFixed(1) : 0}%)</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.agendados / funil.total) * 100 : 0}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-emerald-700 mb-1.5">
              <span>3. Consultas Confirmadas</span>
              <span>{funil.confirmados} ({funil.agendados > 0 ? ((funil.confirmados / funil.agendados) * 100).toFixed(1) : 0}% dos agendados)</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.confirmados / funil.total) * 100 : 0}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-amber-700 mb-1.5">
              <span>4. Compareceram à Clínica</span>
              <span>{funil.compareceram} ({funil.confirmados > 0 ? ((funil.compareceram / funil.confirmados) * 100).toFixed(1) : 0}% dos confirmados)</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${funil.total > 0 ? (funil.compareceram / funil.total) * 100 : 0}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold text-teal-700 mb-1.5">
              <span>5. Tratamento Fechado (Venda)</span>
              <span>{funil.vendidos} ({funil.compareceram > 0 ? ((funil.vendidos / funil.compareceram) * 100).toFixed(1) : 0}% na clínica)</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${funil.compareceram > 0 ? (funil.vendidos / funil.compareceram) * 100 : 0}%` }}></div>
            </div>
          </div>

        </div>
      </div>

      {/* SEÇÃO 5: DEMANDA POR PROCEDIMENTO & PERFORMANCE POR UNIDADE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
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
