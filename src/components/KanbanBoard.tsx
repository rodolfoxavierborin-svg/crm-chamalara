"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// 1. PARSER SEGURO GLOBAL: Vacina anti-NaN para evitar datas inválidas
const parseDataSegura = (dateStr: string | null | undefined): number => {
  if (!dateStr) return 0;
  const safeStr = typeof dateStr === 'string' ? dateStr.trim().replace(' ', 'T') : dateStr;
  const time = new Date(safeStr).getTime();
  return isNaN(time) ? 0 : time;
};

const COLUNAS = [
  { id: 'novo', titulo: 'Novos Pacientes', dot: 'bg-blue-500' },
  { id: 'nao_respondeu', titulo: 'Não Respondeu', dot: 'bg-amber-500' },
  { id: 'agendado', titulo: 'Agendados (IA)', dot: 'bg-indigo-500' },
  { id: 'confirmado', titulo: 'Confirmados', dot: 'bg-emerald-500' },
  { id: 'no_show', titulo: 'Faltou (No-Show)', dot: 'bg-red-500' },
  { id: 'na_clinica', titulo: 'Na Clínica', dot: 'bg-amber-500' },
  { id: 'vendido', titulo: 'Tratamento Fechado', dot: 'bg-teal-500' },
  { id: 'nao_vendido', titulo: 'Tratamento Não Fechado', dot: 'bg-rose-500' },
  { id: 'encerrado', titulo: 'Encerrados', dot: 'bg-slate-400' },
];

const LISTA_UNIDADES = ['Santo André', 'Diadema', 'Mauá', 'São Mateus'];

const GOOGLE_CALENDARS: Record<string, { id: string; color: string }> = {
  'Santo André': { id: 'e53816e5210cbd29f4e2d525f75e9fdbad0333c901a13d213e98d791e99b23b0%40group.calendar.google.com', color: '%23D50000' },
  'Diadema': { id: '205188e12762a447906c539183a8be8e191162831ea3526fced0b3d7a9bf31ff%40group.calendar.google.com', color: '%23F6BF26' },
  'Mauá': { id: '6d64444a84645cd3a6871595cc4f6b1929cdd13d175ef676b5c89f3e4ee265b5%40group.calendar.google.com', color: '%230B8043' },
  'São Mateus': { id: '84903b0600945eccd716d5c0b51a620758e8ea1c6dc7a8bfa75a0b498febfbec%40group.calendar.google.com', color: '%238E24AA' },
};

const OPCOES_PROCEDIMENTO_PADRAO = [
  'Não Informado', 'Avaliação para prótese dentária', 'Implante Dentário', 'Prótese Dentária',
  'Aparelho Ortodôntico', 'Avaliação Geral', 'Limpeza / Profilaxia', 'Clareamento Dentário',
  'Tratamento de Canal', 'Extração / Cirurgia'
];

const OPCOES_FEEDBACK_PADRAO = [
  'Não Informado', 'FECHOU', 'MARCOU RETORNO', 'ACHOU CARO', 'NÃO QUIZ',
  'SEM INTERESSE', 'VOU FALAR COM A FAMILIA', 'SEM DINHEIRO'
];

// Motor de tempo exclusivo do Kanban (Usa data_movimentacao ou created_at)
const getTempoCronologicoKanban = (lead: any) => {
  const timeMovimentacao = parseDataSegura(lead.data_movimentacao);
  if (timeMovimentacao > 0) return timeMovimentacao;
  return parseDataSegura(lead.created_at);
};

const getHorasParado = (lead: any): number => {
  const timeMs = getTempoCronologicoKanban(lead);
  if (!timeMs) return 0;
  return Math.floor((Date.now() - timeMs) / (1000 * 60 * 60));
};

const formatarTempoParado = (horas: number): string => {
  if (horas < 1) return 'Agora';
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  const restHoras = horas % 24;
  return restHoras > 0 ? `${dias}d ${restHoras}h` : `${dias}d`;
};

const formatarDataAgendamento = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const time = parseDataSegura(dateStr);
  if (!time) return '';
  const date = new Date(time);
  const dia = date.getDate().toString().padStart(2, '0');
  const mes = (date.getMonth() + 1).toString().padStart(2, '0');
  const horas = date.getHours().toString().padStart(2, '0');
  const minutos = date.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes} às ${horas}:${minutos}`;
};

const formatarDataCurta = (dateStr?: string | null): string => {
  if (!dateStr) return '';
  const time = parseDataSegura(dateStr);
  if (!time) return '';
  return new Date(time).toLocaleDateString('pt-BR');
};

const formatarDataInput = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  const time = parseDataSegura(isoDate);
  if (!time) return '';
  const date = new Date(time);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateInputToISO = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return new Date(y, m, d, 12, 0, 0).toISOString();
};

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

const formatarMoeda = (val?: number | string | null): string => {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const isWithinDateRange = (dateStr: string | null | undefined, range: string, customStart?: string, customEnd?: string) => {
  if (range === 'all') return true;
  const leadTime = parseDataSegura(dateStr);
  if (leadTime === 0) return false;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (range === 'today') return leadTime >= todayStart && leadTime <= todayEnd;

  if (range === 'yesterday') {
    const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0).getTime();
    const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).getTime();
    return leadTime >= yStart && leadTime <= yEnd;
  }

  if (range === 'last_7') {
    const sevenDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0).getTime();
    return leadTime >= sevenDaysAgoStart && leadTime <= todayEnd;
  }

  if (range === 'last_30') {
    const thirtyDaysAgoStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0).getTime();
    return leadTime >= thirtyDaysAgoStart && leadTime <= todayEnd;
  }

  if (range === 'this_month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    return leadTime >= monthStart && leadTime <= monthEnd;
  }

  if (range === 'custom') {
    let startValid = true, endValid = true;
    if (customStart) {
      const [y, m, d] = customStart.split('-').map(Number);
      const s = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      startValid = leadTime >= s;
    }
    if (customEnd) {
      const [y, m, d] = customEnd.split('-').map(Number);
      const e = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      endValid = leadTime <= e;
    }
    return startValid && endValid;
  }

  return true;
};

export default function KanbanBoard({ onSelectLead, userProfile }: { onSelectLead?: (lead: any) => void; userProfile?: any }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [isBrowser, setIsBrowser] = useState(false);
  const [leadDrawer, setLeadDrawer] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'kanban' | 'analytics' | 'calendar'>('kanban');

  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    name: '', phone: '', unidade: 'Santo André', procedimento: 'Avaliação Geral', promotor: 'Passante de Rua', notas_internas: '', valor_venda: ''
  });

  const cargoNormalized = userProfile?.cargo?.toLowerCase().trim() || '';
  const isAdmin = cargoNormalized === 'admin' || cargoNormalized === 'administrador' || cargoNormalized === 'administrador geral';
  const userUnidade = userProfile?.unidade || 'all';

  useEffect(() => {
    if (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') {
      setUnidadeFilter(userUnidade);
      setNewPatientForm((prev) => ({ ...prev, unidade: userUnidade }));
    }
  }, [userProfile, isAdmin, userUnidade]);

  useEffect(() => {
    setIsBrowser(true);
    fetchLeads();
    const channel = supabase.channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase.from('dentup_leads').select('*');
    if (!error) setLeads(data || []);
  };

  // Blinda o drag para atualizar SOMENTE data_movimentacao (sem tocar em ultima_interacao do Chat)
  const handleDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    
    const newStatus = destination.droppableId;
    const agoraISO = new Date().toISOString();

    let updates: any = { 
      status: newStatus,
      data_movimentacao: agoraISO 
    };

    if (newStatus === 'vendido') {
      const leadEncontrado = leads.find(l => l.id === draggableId);
      if (leadEncontrado && !leadEncontrado.data_venda) {
        updates.data_venda = agoraISO;
      }
    }

    setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, ...updates } : l)));
    await supabase.from('dentup_leads').update(updates).eq('id', draggableId);
  };

  const handleUpdateLead = async (campo: string, valor: any) => {
    if (!leadDrawer) return;
    const updatedDrawer = { ...leadDrawer, [campo]: valor };
    setLeadDrawer(updatedDrawer);
    setLeads((prev) => prev.map((l) => (l.id === leadDrawer.id ? { ...l, [campo]: valor } : l)));
    await supabase.from('dentup_leads').update({ [campo]: valor }).eq('id', leadDrawer.id);
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientForm.name || !newPatientForm.phone) {
      alert('Por favor, preencha o Nome e o WhatsApp do paciente.');
      return;
    }

    setSavingPatient(true);
    const payload = {
      name: newPatientForm.name,
      phone: newPatientForm.phone,
      unidade: newPatientForm.unidade,
      procedimento: newPatientForm.procedimento,
      promotor: newPatientForm.promotor,
      notas_internas: newPatientForm.notas_internas,
      valor_venda: newPatientForm.valor_venda ? Number(newPatientForm.valor_venda) : null,
      status: 'novo',
      is_paused: true,
      created_at: new Date().toISOString(),
      data_movimentacao: new Date().toISOString()
    };

    const { error } = await supabase.from('dentup_leads').insert([payload]).select();
    setSavingPatient(false);

    if (error) {
      alert('Erro ao cadastrar paciente: ' + error.message);
    } else {
      setIsNewPatientModalOpen(false);
      setNewPatientForm({
        name: '', phone: '', unidade: !isAdmin && userUnidade !== 'all' ? userUnidade : 'Santo André', procedimento: 'Avaliação Geral', promotor: 'Passante de Rua', notas_internas: '', valor_venda: ''
      });
      fetchLeads();
    }
  };

  const targetUnidade = (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') ? userUnidade : unidadeFilter;
  
  const leadsNaUnidadeGlobal = useMemo(() => {
    return leads.filter((lead) => {
      if (targetUnidade === 'all' || targetUnidade === 'Todas') return true;
      const leadUnid = lead.unidade || lead.unit || 'Pendente';
      return leadUnid.toLowerCase() === targetUnidade.toLowerCase();
    });
  }, [leads, targetUnidade]);

  // Cartões visíveis nas colunas do Kanban
  const leadsVisiveisKanban = useMemo(() => {
    return leadsNaUnidadeGlobal.filter((lead) => {
      if (dateRange === 'all') return true;
      const interacao = isWithinDateRange(lead.ultima_interacao || lead['última_interação'], dateRange, customStart, customEnd);
      const criacao = isWithinDateRange(lead.created_at, dateRange, customStart, customEnd);
      const agendamento = isWithinDateRange(lead.data_agendamento, dateRange, customStart, customEnd);
      const venda = isWithinDateRange(lead.data_venda, dateRange, customStart, customEnd);
      const movimentacao = isWithinDateRange(lead.data_movimentacao, dateRange, customStart, customEnd);
      return interacao || criacao || agendamento || venda || movimentacao;
    });
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  const leadsFiltrados = useMemo(() => {
    const termo = searchTerm.toLowerCase().trim();
    if (!termo) return leadsVisiveisKanban;
    return leadsVisiveisKanban.filter((lead) => {
      return (lead.name || '').toLowerCase().includes(termo) || (lead.phone || lead.phone_number || '').toLowerCase().includes(termo);
    });
  }, [leadsVisiveisKanban, searchTerm]);

  // --- BLINDAGEM DAS MÉTRICAS DO FUNIL ---
  // 1. Novos Leads do Período: Considera estritamente a DATA DE CRIAÇÃO (created_at)
  const leadsCriadosNoPeriodo = useMemo(() => {
    return leadsNaUnidadeGlobal.filter((l) => isWithinDateRange(l.created_at, dateRange, customStart, customEnd));
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  const totalLeads = leadsCriadosNoPeriodo.length;

  // 2. Agendamentos no Período
  const agendados = useMemo(() => {
    return leadsNaUnidadeGlobal.filter(l => 
      ['agendado', 'confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status) &&
      isWithinDateRange(l.data_agendamento || l.created_at, dateRange, customStart, customEnd)
    ).length;
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  const confirmados = useMemo(() => {
    return leadsNaUnidadeGlobal.filter(l => 
      ['confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status) &&
      isWithinDateRange(l.data_agendamento || l.created_at, dateRange, customStart, customEnd)
    ).length;
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  const compareceram = useMemo(() => {
    return leadsNaUnidadeGlobal.filter(l => 
      ['na_clinica', 'vendido', 'nao_vendido'].includes(l.status) &&
      isWithinDateRange(l.data_agendamento || l.created_at, dateRange, customStart, customEnd)
    ).length;
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  // 3. Vendas e Faturamento do Período (baseado estritamente em data_venda)
  const vendasRealizadas = useMemo(() => {
    return leadsNaUnidadeGlobal.filter(l => l.status === 'vendido' && isWithinDateRange(l.data_venda || l.created_at, dateRange, customStart, customEnd));
  }, [leadsNaUnidadeGlobal, dateRange, customStart, customEnd]);

  const vendidos = vendasRealizadas.length;
  const faturamentoTotal = useMemo(() => vendasRealizadas.reduce((acc, l) => acc + (Number(l.valor_venda) || 0), 0), [vendasRealizadas]);

  const totalEstagnados = useMemo(() => {
    return leadsNaUnidadeGlobal.filter(l => getHorasParado(l) >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(l.status)).length;
  }, [leadsNaUnidadeGlobal]);

  const taxaAgendamento = totalLeads > 0 ? ((agendados / totalLeads) * 100).toFixed(1) : '0.0';
  const taxaConfirmacao = agendados > 0 ? ((confirmados / agendados) * 100).toFixed(1) : '0.0';
  const taxaComparecimento = confirmados > 0 ? ((compareceram / confirmados) * 100).toFixed(1) : '0.0';
  const taxaFechamento = compareceram > 0 ? ((vendidos / compareceram) * 100).toFixed(1) : '0.0';

  const getGoogleCalendarUrl = () => {
    const baseUrl = "https://calendar.google.com/calendar/embed?ctz=America%2FSao_Paulo&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=1&showCalendars=1&showTz=0&mode=WEEK";
    if (targetUnidade !== 'all' && targetUnidade !== 'Todas' && GOOGLE_CALENDARS[targetUnidade]) {
      const cal = GOOGLE_CALENDARS[targetUnidade];
      return `${baseUrl}&src=${cal.id}&color=${cal.color}`;
    }
    const allSources = Object.values(GOOGLE_CALENDARS).map(cal => `&src=${cal.id}&color=${cal.color}`).join('');
    return `${baseUrl}${allSources}`;
  };

  const procedimentoAtual = leadDrawer?.procedimento || 'Não Informado';
  const opcoesProcedimento = OPCOES_PROCEDIMENTO_PADRAO.includes(procedimentoAtual) ? OPCOES_PROCEDIMENTO_PADRAO : [procedimentoAtual, ...OPCOES_PROCEDIMENTO_PADRAO];
  const feedbackAtual = leadDrawer?.feedback || 'Não Informado';
  const opcoesFeedback = OPCOES_FEEDBACK_PADRAO.includes(feedbackAtual) ? OPCOES_FEEDBACK_PADRAO : [feedbackAtual, ...OPCOES_FEEDBACK_PADRAO];

  // Métricas do Gráfico da Aba Analytics
  const procsCount = useMemo(() => {
    const counts: Record<string, number> = {};
    leadsCriadosNoPeriodo.forEach(l => {
      const p = l.procedimento || 'Não Informado';
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [leadsCriadosNoPeriodo]);

  const chartBuckets = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; total: number; agendados: number }[] = [];
    if (dateRange === 'today') {
      const horas = [8, 10, 12, 14, 16, 18, 20];
      horas.forEach((h) => {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h - 2, 0, 0).getTime();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0).getTime();
        const label = `${h.toString().padStart(2, '0')}:00`;
        const leadsNoIntervalo = leadsNaUnidadeGlobal.filter((l) => {
          const t = parseDataSegura(l.created_at);
          return t >= start && t < end;
        });
        const agendadosNoIntervalo = leadsNoIntervalo.filter((l) => ['agendado', 'confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status));
        buckets.push({ label, total: leadsNoIntervalo.length, agendados: agendadosNoIntervalo.length });
      });
    } else {
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
        const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
        const label = i === 0 ? 'Hoje' : `${diasSemana[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
        const leadsNoDia = leadsNaUnidadeGlobal.filter((l) => {
          const t = parseDataSegura(l.created_at);
          return t >= start && t <= end;
        });
        const agendadosNoDia = leadsNoDia.filter((l) => ['agendado', 'confirmado', 'na_clinica', 'vendido', 'nao_vendido', 'no_show'].includes(l.status));
        buckets.push({ label, total: leadsNoDia.length, agendados: agendadosNoDia.length });
      }
    }
    return buckets;
  }, [dateRange, leadsNaUnidadeGlobal]);

  const svgWidth = 600, svgHeight = 200, paddingX = 40, paddingY = 30;
  const plotWidth = svgWidth - paddingX * 2, plotHeight = svgHeight - paddingY * 2;
  const maxVal = useMemo(() => Math.max(...chartBuckets.map((b) => b.total), 5), [chartBuckets]);
  
  const pointsTotal = useMemo(() => chartBuckets.map((b, idx) => ({ x: paddingX + idx * (plotWidth / Math.max(chartBuckets.length - 1, 1)), y: paddingY + plotHeight - (b.total / maxVal) * plotHeight, val: b.total })), [chartBuckets, maxVal, plotWidth, plotHeight]);
  const pointsAgendados = useMemo(() => chartBuckets.map((b, idx) => ({ x: paddingX + idx * (plotWidth / Math.max(chartBuckets.length - 1, 1)), y: paddingY + plotHeight - (b.agendados / maxVal) * plotHeight, val: b.agendados })), [chartBuckets, maxVal, plotWidth, plotHeight]);
  
  const generateLinePath = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const generateAreaPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    const line = generateLinePath(pts);
    const lastX = pts[pts.length - 1].x.toFixed(1), firstX = pts[0].x.toFixed(1), bottomY = (paddingY + plotHeight).toFixed(1);
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  if (!isBrowser) return null;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] text-slate-800 font-sans">
      
      {/* HEADER EM DUAS CAMADAS */}
      <div className="bg-white border-b border-slate-200/80 z-10 sticky top-0 shadow-sm">
        
        {/* LINHA 1: NAVEGAÇÃO E AÇÕES */}
        <div className="px-6 py-3 flex items-center justify-between border-b border-slate-100 gap-4 flex-wrap">
          
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button 
              onClick={() => setActiveTab('kanban')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'kanban' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
              <span>Quadro CRM</span>
            </button>
            <button 
              onClick={() => setActiveTab('analytics')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'analytics' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Analytics</span>
            </button>
            <button 
              onClick={() => setActiveTab('calendar')} 
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Agenda</span>
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button 
              onClick={() => setIsNewPatientModalOpen(true)} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm hover:shadow flex items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              <span>Novo Paciente</span>
            </button>

            <select 
              disabled={!isAdmin && userUnidade !== 'Todas' && userUnidade !== 'all'} 
              value={targetUnidade} 
              onChange={(e) => setUnidadeFilter(e.target.value)} 
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-semibold outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">Todas as Unidades</option>
              {LISTA_UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>

            {activeTab !== 'calendar' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select 
                  value={dateRange} 
                  onChange={(e) => setDateRange(e.target.value)} 
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="this_month">Este Mês</option>
                  <option value="today">Hoje</option>
                  <option value="yesterday">Ontem</option>
                  <option value="last_7">Últimos 7 dias</option>
                  <option value="all">Todo o Período</option>
                  <option value="custom">Personalizado</option>
                </select>

                {dateRange === 'custom' && (
                  <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-lg border border-slate-200/80">
                    <input 
                      type="date" 
                      value={customStart} 
                      onChange={(e) => setCustomStart(e.target.value)} 
                      className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                    />
                    <span className="text-[11px] font-bold text-slate-400">até</span>
                    <input 
                      type="date" 
                      value={customEnd} 
                      onChange={(e) => setCustomEnd(e.target.value)} 
                      className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-500 cursor-pointer shadow-sm"
                    />
                  </div>
                )}

                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Buscar paciente..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 w-44 shadow-inner" 
                  />
                  <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LINHA 2: BANNER DE MÉTRICAS DO FUNIL COM DESTAQUE FINANCEIRO */}
        <div className="px-6 py-3 bg-slate-50/70 flex items-center justify-between gap-4 overflow-x-auto custom-scrollbar">
          
          <div className="flex items-center gap-6 md:gap-8 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leads Totais</span>
                <span className="text-xl md:text-2xl font-black text-slate-800 leading-tight">{totalLeads}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Agendados (IA)</span>
                  <span className="text-[10px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-full">{taxaAgendamento}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-indigo-600 leading-tight">{agendados}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Confirmados</span>
                  <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded-full">{taxaConfirmacao}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-emerald-600 leading-tight">{confirmados}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Na Clínica</span>
                  <span className="text-[10px] font-extrabold bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded-full">{taxaComparecimento}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-amber-600 leading-tight">{compareceram}</span>
              </div>
            </div>

            <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>

            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Vendas Fechadas</span>
                  <span className="text-[10px] font-extrabold bg-teal-100 text-teal-700 px-1.5 py-0.2 rounded-full">{taxaFechamento}%</span>
                </div>
                <span className="text-xl md:text-2xl font-black text-teal-600 leading-tight">{vendidos}</span>
              </div>
            </div>

            {/* CARD DE FATURAMENTO TOTAL EM R$ */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="w-3 h-3 rounded-full bg-emerald-600 animate-pulse"></div>
              <div>
                <span className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Faturamento Total</span>
                <span className="text-xl md:text-2xl font-black text-emerald-600 leading-tight">{formatarMoeda(faturamentoTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-4 border-l border-slate-200 shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                SLA Parado (+24h)
              </span>
              <span className="text-lg font-extrabold text-red-600">{totalEstagnados}</span>
            </div>
          </div>

        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* VIEW 1: QUADRO KANBAN */}
        {activeTab === 'kanban' && (
          <div className="flex-1 overflow-x-auto p-6 custom-scrollbar">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-6 h-full items-start">
                {COLUNAS.map((coluna) => {
                  const leadsDaColuna = leadsFiltrados
                    .filter((l) => (l.status || 'novo') === coluna.id)
                    .sort((a, b) => getTempoCronologicoKanban(b) - getTempoCronologicoKanban(a));
                  
                  return (
                    <Droppable droppableId={coluna.id} key={coluna.id}>
                      {(provided, snapshot) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className={`flex-shrink-0 w-[340px] flex flex-col max-h-full rounded-xl bg-slate-100/80 border border-slate-200 p-3 transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200 border-blue-300' : ''}`}>
                          <div className="mb-4 px-2 flex justify-between items-center pt-1">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${coluna.dot} shadow-sm`}></div>
                              <h3 className="font-bold text-slate-800 text-base">{coluna.titulo}</h3>
                            </div>
                            <span className="text-slate-600 text-sm font-semibold bg-slate-200 px-3 py-1 rounded-full">{leadsDaColuna.length}</span>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto space-y-3 p-1 custom-scrollbar min-h-[150px]">
                            {leadsDaColuna.map((lead, index) => {
                              const horasParado = getHorasParado(lead);
                              const isCritico = horasParado >= 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(coluna.id);
                              const isAlerta = horasParado >= 12 && horasParado < 24 && !['vendido', 'nao_vendido', 'encerrado'].includes(coluna.id);

                              return (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                      onClick={() => setLeadDrawer(lead)}
                                      className={`p-4 rounded-xl border transition-all cursor-grab group bg-white ${
                                        snapshot.isDragging ? 'border-blue-500 shadow-xl z-50 scale-[1.02]' : 
                                        isCritico ? 'border-red-300 bg-red-50 hover:border-red-400 shadow-sm' : 
                                        isAlerta ? 'border-amber-300 bg-amber-50 hover:border-amber-400 shadow-sm' : 
                                        'border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md'
                                      }`}
                                      style={{ ...provided.draggableProps.style }}
                                    >
                                      <div className="flex justify-between items-start mb-1.5 gap-2">
                                        <h4 className="font-semibold text-slate-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1">{lead.name || 'Sem Nome'}</h4>
                                        {lead.is_paused && <span className="text-xs bg-slate-800 text-white px-2 py-1 rounded-md font-medium shrink-0 shadow-sm">Humano</span>}
                                      </div>
                                      
                                      <p className="text-xs font-medium text-slate-500 mb-2">
                                        {formatarTelefone(lead.phone || lead.phone_number)}
                                      </p>
                                      
                                      {lead.promotor && (
                                        <p className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-fit mb-2">
                                          👤 Origem: {lead.promotor}
                                        </p>
                                      )}

                                      {/* BADGE DE VALOR DE VENDA NO CARD DO KANBAN COM DATA DA VENDA */}
                                      {lead.valor_venda && Number(lead.valor_venda) > 0 && (
                                        <div className="flex flex-col gap-1.5 mb-2 w-fit">
                                          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                                            💰 {formatarMoeda(lead.valor_venda)}
                                          </div>
                                          {lead.data_venda && (
                                            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-white border border-emerald-100 px-2 py-0.5 rounded shadow-sm w-fit">
                                              📅 Venda: {formatarDataCurta(lead.data_venda)}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {lead.data_agendamento && (
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50/90 border border-indigo-100/80 px-2.5 py-1 rounded-lg mb-2.5 w-fit">
                                          <svg className="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          <span>{formatarDataAgendamento(lead.data_agendamento)}</span>
                                        </div>
                                      )}

                                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                        <span className="text-xs text-slate-600 font-medium bg-slate-100 px-2 py-1 rounded-md">{lead.unidade !== 'Pendente' ? lead.unidade : 'Sem Unidade'}</span>
                                        <span className={`text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1.5 ${
                                          isCritico ? 'bg-red-100 text-red-700' : 
                                          isAlerta ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                          {isCritico && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                                          {formatarTempoParado(horasParado)}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </DragDropContext>
          </div>
        )}

        {/* VIEW 2: PAINEL ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            
            {/* GRÁFICO VETORIAL DE EVOLUÇÃO */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Volume de Pacientes vs. Agendamentos</h3>
                  <p className="text-xs text-slate-500">Comparativo do fluxo de entrada de demanda x conversão inicial em agendamentos no período selecionado</p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span className="text-slate-600">Entrada de Leads</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                    <span className="text-slate-600">Agendados (IA)</span>
                  </div>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-56">
                  {/* Linhas de Grade e Eixos */}
                  <line x1={paddingX} y1={paddingY} x2={paddingX} y2={paddingY + plotHeight} stroke="#E2E8F0" strokeWidth="1" />
                  <line x1={paddingX} y1={paddingY + plotHeight} x2={paddingX + plotWidth} y2={paddingY + plotHeight} stroke="#E2E8F0" strokeWidth="1" />
                  
                  {/* Área e Linha de Leads Totais */}
                  <path d={generateAreaPath(pointsTotal)} fill="rgba(59, 130, 246, 0.08)" />
                  <path d={generateLinePath(pointsTotal)} fill="none" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />

                  {/* Área e Linha de Agendados */}
                  <path d={generateAreaPath(pointsAgendados)} fill="rgba(99, 102, 241, 0.12)" />
                  <path d={generateLinePath(pointsAgendados)} fill="none" stroke="#6366F1" strokeWidth="3" strokeLinecap="round" />

                  {/* Pontos de Dados */}
                  {pointsTotal.map((p, i) => (
                    <g key={`total-${i}`}>
                      <circle cx={p.x} cy={p.y} r="4" fill="#3B82F6" className="transition-all hover:r-6" />
                      <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[10px] font-bold fill-blue-600">{p.val}</text>
                      <text x={p.x} y={paddingY + plotHeight + 16} textAnchor="middle" className="text-[10px] font-medium fill-slate-400">{chartBuckets[i]?.label}</text>
                    </g>
                  ))}

                  {pointsAgendados.map((p, i) => (
                    <g key={`agend-${i}`}>
                      <circle cx={p.x} cy={p.y} r="4" fill="#6366F1" className="transition-all hover:r-6" />
                      <text x={p.x} y={p.y - 8} textAnchor="middle" className="text-[10px] font-bold fill-indigo-600">{p.val}</text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* TABELA DE PROCEDIMENTOS */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <h3 className="font-bold text-slate-800 text-lg mb-1">Demanda por Procedimento</h3>
              <p className="text-xs text-slate-500 mb-6">Distribuição dos tratamentos buscados pelos novos pacientes</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(procsCount).map(([procedimento, quantidade]) => {
                  const porcentagem = totalLeads > 0 ? ((quantidade / totalLeads) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={procedimento} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-slate-700 line-clamp-1">{procedimento}</span>
                        <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{quantidade}</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${porcentagem}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium text-right mt-1">{porcentagem}% dos leads</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* VIEW 3: ABA DA AGENDA GOOGLE EMBUTIDA */}
        {activeTab === 'calendar' && (
          <div className="flex-1 h-full w-full bg-white p-4">
            <iframe 
              src={getGoogleCalendarUrl()} 
              style={{ border: 0 }} 
              className="w-full h-full rounded-xl border border-slate-200 shadow-sm"
              frameBorder="0" 
              scrolling="no"
            />
          </div>
        )}

        {/* FICHA DO PACIENTE (GAVETA LATERAL CORRIGIDA) */}
        {leadDrawer && (
          <>
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-20" onClick={() => setLeadDrawer(null)} />
            <div className="w-[450px] bg-white shadow-2xl flex flex-col z-30 absolute right-0 top-0 bottom-0 animate-in slide-in-from-right-8 duration-300">
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Ficha do Paciente</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Gestão de Informações</p>
                </div>
                <button onClick={() => setLeadDrawer(null)} className="text-slate-400 hover:text-slate-700 text-xl font-light">✕</button>
              </div>
              
              <div className="p-8 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Nome Completo</label>
                  <input type="text" value={leadDrawer.name || ''} onChange={(e) => setLeadDrawer({...leadDrawer, name: e.target.value})} onBlur={(e) => handleUpdateLead('name', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" />
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">WhatsApp</label>
                  <input type="text" readOnly value={formatarTelefone(leadDrawer.phone || leadDrawer.phone_number)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-500 outline-none cursor-not-allowed" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Unidade</label>
                    <select value={leadDrawer.unidade || 'Pendente'} onChange={(e) => handleUpdateLead('unidade', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer">
                      {['Pendente', 'Santo André', 'Diadema', 'Mauá', 'São Mateus'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Procedimento</label>
                    <select value={procedimentoAtual} onChange={(e) => handleUpdateLead('procedimento', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm cursor-pointer">
                      {opcoesProcedimento.map((p) => (<option key={p} value={p}>{p}</option>))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Feedback do Paciente</label>
                  <select value={feedbackAtual} onChange={(e) => handleUpdateLead('feedback', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm font-medium cursor-pointer">
                    {opcoesFeedback.map((f) => (<option key={f} value={f}>{f}</option>))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Promotor / Origem</label>
                  <input type="text" value={leadDrawer.promotor || ''} onChange={(e) => setLeadDrawer({...leadDrawer, promotor: e.target.value})} onBlur={(e) => handleUpdateLead('promotor', e.target.value)} placeholder="Ex: Passante de Rua..." className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 shadow-sm" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">Anotações Internas</label>
                  <textarea rows={4} value={leadDrawer.notas_internas || ''} onChange={(e) => setLeadDrawer({...leadDrawer, notas_internas: e.target.value})} onBlur={(e) => handleUpdateLead('notas_internas', e.target.value)} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 resize-none shadow-sm" placeholder="Observações do atendimento clínico..." />
                </div>

                {/* BLOCO FINANCEIRO */}
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-emerald-800 uppercase block mb-1 flex items-center gap-1.5">
                      <span>💰 Valor do Tratamento Fechado (R$)</span>
                    </label>
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="Ex: 3500.00" 
                      value={leadDrawer.valor_venda ?? ''} 
                      onChange={(e) => setLeadDrawer({...leadDrawer, valor_venda: e.target.value})} 
                      onBlur={(e) => handleUpdateLead('valor_venda', e.target.value ? Number(e.target.value) : null)} 
                      className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-extrabold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm" 
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-emerald-800 uppercase block mb-1 flex items-center gap-1.5">
                      <span>📅 Data da Venda</span>
                    </label>
                    <input 
                      type="date" 
                      value={formatarDataInput(leadDrawer.data_venda)} 
                      onChange={(e) => {
                        const isoStr = dateInputToISO(e.target.value);
                        setLeadDrawer({...leadDrawer, data_venda: isoStr});
                      }} 
                      onBlur={(e) => {
                        const isoStr = dateInputToISO(e.target.value);
                        handleUpdateLead('data_venda', isoStr);
                      }}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-sm font-semibold text-emerald-700 outline-none focus:border-emerald-500 shadow-sm cursor-pointer" 
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => handleUpdateLead('is_paused', !leadDrawer.is_paused)} className={`py-2.5 rounded-lg font-bold text-xs transition-colors border ${leadDrawer.is_paused ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}>
                    {leadDrawer.is_paused ? '▶ Retomar Robô (IA)' : '⏸️ Pausar IA (Assumir)'}
                  </button>
                  <button onClick={() => { if (onSelectLead) onSelectLead(leadDrawer); }} className="py-2.5 bg-blue-600 text-white rounded-lg font-bold text-xs hover:bg-blue-700 transition-all shadow-sm">
                    Abrir no Chat
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}} />
    </div>
  );
}